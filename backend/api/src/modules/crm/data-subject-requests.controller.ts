import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  CreateDataSubjectRequestDto,
  DataSubjectRequestQueryDto,
  DataSubjectRequestResponseDto,
  RejectDataSubjectRequestDto,
} from './dto/data-subject-request.dto';

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
      where: { contactId: query.contactId, status: query.status },
      orderBy: { createdAt: 'desc' },
    });
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
