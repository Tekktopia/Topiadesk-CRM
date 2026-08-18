import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  CreateDataSubjectRequestDto,
  DataSubjectRequestQueryDto,
  DataSubjectRequestResponseDto,
  DataSubjectRequestStatsResponseDto,
  DSR_DUE_SOON_DAYS,
  DSR_RESPONSE_DEADLINE_DAYS,
  RejectDataSubjectRequestDto,
} from './dto/data-subject-request.dto';
import { dataSubjectRequestsToCsv } from './data-subject-request-csv';

const REDACTED = '[Redacted]';

/**
 * NDPR/GDPR Data Subject Requests — a Contact's "export my data"/"erase my
 * data" request. Gated on 'account' throughout, same as ContactsController
 * (no dedicated resource — see that controller's header comment). Creating
 * a request just logs intent (PENDING); process()/reject() are the
 * fulfillment step, kept as an explicit separate action (not automatic on
 * create) so a compliance-sensitive irreversible anonymization always has a
 * deliberate human trigger, not a side effect of form submission.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/data-subject-requests')
export class DataSubjectRequestsController {
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [DataSubjectRequestResponseDto] })
  async list(@Query() query: DataSubjectRequestQueryDto): Promise<DataSubjectRequestResponseDto[]> {
    return getPrismaClient().dataSubjectRequest.findMany({
      where: dsrListWhere(query),
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Compliance-queue aggregates. `overdue` is the number that matters — a
   * PENDING request past the statutory window is a breach, not a backlog
   * item. See DataSubjectRequestStatsResponseDto.
   *
   * Must precede ':id' — Nest matches literal segments in declaration order.
   */
  @Get('stats')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: DataSubjectRequestStatsResponseDto })
  async stats(@Query() query: DataSubjectRequestQueryDto): Promise<DataSubjectRequestStatsResponseDto> {
    const prisma = getPrismaClient();
    const where = dsrListWhere(query);

    const now = Date.now();
    const deadlineCutoff = new Date(now - DSR_RESPONSE_DEADLINE_DAYS * 86_400_000);
    const warnCutoff = new Date(now - (DSR_RESPONSE_DEADLINE_DAYS - DSR_DUE_SOON_DAYS) * 86_400_000);

    // AND, never a spread-and-override: `{ ...where, status: 'PENDING' }`
    // REPLACES a status the caller already filtered on, so viewing the
    // COMPLETED tab would still report a pending/overdue count drawn from
    // outside the filter — and `overdue` is the one number here with a legal
    // consequence, so reporting it against the wrong population is the worst
    // possible place for this bug. Intersecting returns 0 for the impossible
    // combination, which is the truth for that view.
    const [total, pending, completed, rejected, overdue, dueSoon] = await Promise.all([
      prisma.dataSubjectRequest.count({ where }),
      prisma.dataSubjectRequest.count({ where: { AND: [where, { status: 'PENDING' as const }] } }),
      prisma.dataSubjectRequest.count({ where: { AND: [where, { status: 'COMPLETED' as const }] } }),
      prisma.dataSubjectRequest.count({ where: { AND: [where, { status: 'REJECTED' as const }] } }),
      prisma.dataSubjectRequest.count({
        where: { AND: [where, { status: 'PENDING' as const, createdAt: { lt: deadlineCutoff } }] },
      }),
      // Inside the warning window but not yet past the deadline — the two
      // buckets are deliberately disjoint so they can be added without
      // double-counting.
      prisma.dataSubjectRequest.count({
        where: { AND: [where, { status: 'PENDING' as const, createdAt: { lt: warnCutoff, gte: deadlineCutoff } }] },
      }),
    ]);

    return { total, pending, completed, rejected, overdue, dueSoon, deadlineDays: DSR_RESPONSE_DEADLINE_DAYS };
  }

  /**
   * CSV of the compliance REGISTER — receipt and turnaround evidence, never
   * the exported PII snapshots themselves. See data-subject-request-csv.ts
   * for why `exportData` is excluded. Must precede ':id'.
   */
  @Get('export')
  @RequirePermission('account', 'read')
  async export(@Query() query: DataSubjectRequestQueryDto, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const requests = await getPrismaClient().dataSubjectRequest.findMany({
      where: dsrListWhere(query),
      include: { contact: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const csv = dataSubjectRequestsToCsv(requests);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="data-subject-requests.csv"' });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Get(':id')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: DataSubjectRequestResponseDto })
  async getOne(@Param('id') id: string): Promise<DataSubjectRequestResponseDto> {
    const request = await getPrismaClient().dataSubjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Data subject request not found');
    return request;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: DataSubjectRequestResponseDto })
  async create(@Body() dto: CreateDataSubjectRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<DataSubjectRequestResponseDto> {
    const prisma = getPrismaClient();
    const contact = await prisma.contact.findUnique({ where: { id: dto.contactId }, select: { id: true } });
    if (!contact) throw new NotFoundException('Contact not found');
    return prisma.dataSubjectRequest.create({
      data: { contactId: dto.contactId, requestType: dto.requestType, notes: dto.notes, requestedById: user.id },
    });
  }

  /**
   * Fulfills the request. EXPORT snapshots the contact's own fields plus
   * their activities and parent account name into `exportData` (see
   * DataSubjectRequest's schema comment for why that stays inline JSON
   * rather than a Document). DELETE overwrites PII fields in place and sets
   * Contact.anonymizedAt — the row itself survives (Activity/Case/
   * PolicyParticipant FKs depend on it), it just stops being personally
   * identifiable.
   */
  @Post(':id/process')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: DataSubjectRequestResponseDto })
  async process(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<DataSubjectRequestResponseDto> {
    const prisma = getPrismaClient();
    const request = await prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Data subject request not found');
    if (request.status !== 'PENDING') throw new BadRequestException(`Request is already ${request.status}`);

    if (request.requestType === 'EXPORT') {
      const contact = await prisma.contact.findUniqueOrThrow({
        where: { id: request.contactId },
        include: { account: { select: { name: true } } },
      });
      const activities = await prisma.activity.findMany({
        where: { contactId: request.contactId },
        select: { type: true, direction: true, subject: true, occurredAt: true },
        orderBy: { occurredAt: 'desc' },
      });
      const exportData = {
        exportedAt: new Date().toISOString(),
        contact: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          householdRole: contact.householdRole,
          idType: contact.idType,
          idNumber: contact.idNumber,
          customFields: contact.customFields,
        },
        account: contact.account?.name ?? null,
        activities,
      };
      return prisma.dataSubjectRequest.update({
        where: { id },
        data: { status: 'COMPLETED', exportData, processedById: user.id, processedAt: new Date() },
      });
    }

    // DELETE
    await prisma.contact.update({
      where: { id: request.contactId },
      data: {
        firstName: REDACTED,
        lastName: REDACTED,
        email: null,
        phone: null,
        title: null,
        householdRole: null,
        idType: null,
        idNumber: null,
        anonymizedAt: new Date(),
      },
    });
    return prisma.dataSubjectRequest.update({
      where: { id },
      data: { status: 'COMPLETED', processedById: user.id, processedAt: new Date() },
    });
  }

  @Post(':id/reject')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: DataSubjectRequestResponseDto })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDataSubjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DataSubjectRequestResponseDto> {
    const prisma = getPrismaClient();
    const request = await prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Data subject request not found');
    if (request.status !== 'PENDING') throw new BadRequestException(`Request is already ${request.status}`);
    return prisma.dataSubjectRequest.update({
      where: { id },
      data: { status: 'REJECTED', notes: dto.reason, processedById: user.id, processedAt: new Date() },
    });
  }
}

/** Shared by list() and stats() so the queue and its header never disagree. */
function dsrListWhere(query: DataSubjectRequestQueryDto): Prisma.DataSubjectRequestWhereInput {
  return { contactId: query.contactId, status: query.status, requestType: query.requestType };
}
