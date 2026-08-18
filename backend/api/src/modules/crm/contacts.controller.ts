import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  assertFieldsWritable,
  redactHiddenFields,
  redactHiddenFieldsMany,
  resolveFieldVisibilities,
  sensitiveFieldsExposed,
} from '../../common/field-permissions/field-visibility.util';
import { AuditService } from '../../common/audit/audit.service';
import {
  BulkAssignContactsDto,
  BulkDeleteContactsDto,
  BulkUpdateContactsDto,
  ContactQueryDto,
  ContactResponseDto,
  ContactStatsResponseDto,
  CreateContactDto,
  UpdateContactDto,
} from './dto/contact.dto';
import { BulkActionResponseDto } from './dto/bulk-action.dto';
import { CheckContactDuplicatesQueryDto, DuplicateGroupDto } from './dto/duplicate-check.dto';
import { MergeRequestDto, MergeResponseDto } from './dto/merge.dto';
import { validateCustomFields } from './custom-fields.validator';
import { diffBulkIds } from './bulk-actions';
import { checkContactDuplicates } from './duplicate-detection';
import { mergeContacts } from './merge';
import { contactsToCsv } from './contact-csv';
import { enqueueEntityEvent } from '../case-management/automation-events.util';

/** Gated on the dedicated 'contact' permission resource (see baseline.ts seed — every role grants it at the same tier as 'account' for now, a pure decoupling from the account resource it used to reuse). */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/contacts')
export class ContactsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('contact', 'read')
  @ApiOkResponse({ type: [ContactResponseDto] })
  async list(@Query() query: ContactQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<ContactResponseDto[]> {
    const contacts = await getPrismaClient().contact.findMany({
      where: contactListWhere(query),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      // Previously unbounded — every contact in the tenant on every request.
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    });
    return redactHiddenFieldsMany(contacts, await resolveFieldVisibilities(user, 'contact'));
  }

  @Get('count')
  @RequirePermission('contact', 'read')
  @ApiOkResponse({ type: Number })
  async count(@Query() query: ContactQueryDto): Promise<{ count: number }> {
    const count = await getPrismaClient().contact.count({ where: contactListWhere(query) });
    return { count };
  }

  @Get('stats')
  @RequirePermission('contact', 'read')
  @ApiOkResponse({ type: ContactStatsResponseDto })
  async stats(@Query() query: ContactQueryDto): Promise<ContactStatsResponseDto> {
    const prisma = getPrismaClient();
    const where = contactListWhere(query);
    // "Reachable" is an OR across two nullable columns, which groupBy cannot
    // express — four counts is both clearer and cheaper than reading every
    // row back to fold in JS.
    const [total, primary, reachable, anonymized] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.count({ where: { AND: [where, { isPrimary: true }] } }),
      prisma.contact.count({
        // Nested inside AND so this OR can't clobber a search OR already
        // sitting on `where` — a spread would have silently replaced it.
        where: { AND: [where, { OR: [{ email: { not: null } }, { phone: { not: null } }] }] },
      }),
      prisma.contact.count({ where: { AND: [where, { anonymizedAt: { not: null } }] } }),
    ]);
    return { total, primary, reachable, unreachable: total - reachable, anonymized };
  }

  @Get('export')
  @RequirePermission('contact', 'read')
  async export(
    @Query() query: ContactQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const contacts = await getPrismaClient().contact.findMany({
      where: contactListWhere(query),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10_000,
    });
    // Field-level visibility applies to the export too — otherwise CSV would
    // be a trivial way to read around a hidden-field permission that the
    // on-screen list correctly redacts.
    const visible = redactHiddenFieldsMany(contacts, await resolveFieldVisibilities(user, 'contact'));
    const csv = contactsToCsv(visible as typeof contacts);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="contacts.csv"' });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  // Must precede ':id' — Nest matches literal segments in declaration order
  // ahead of a dynamic param competing for the same position.
  @Get('check-duplicates')
  @RequirePermission('contact', 'read')
  @ApiOkResponse({ type: [DuplicateGroupDto] })
  async checkDuplicates(@Query() query: CheckContactDuplicatesQueryDto): Promise<DuplicateGroupDto[]> {
    return checkContactDuplicates(query);
  }

  @Get(':id')
  @RequirePermission('contact', 'read')
  @ApiOkResponse({ type: ContactResponseDto })
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<ContactResponseDto> {
    const contact = await getPrismaClient().contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contact not found');
    const visibilities = await resolveFieldVisibilities(user, 'contact');
    const exposedSensitiveFields = sensitiveFieldsExposed('contact', visibilities);
    if (exposedSensitiveFields.length > 0) {
      await this.auditService.recordEvent({
        action: 'VIEW_SENSITIVE',
        entityType: 'contact',
        entityId: id,
        changedFields: { fields: exposedSensitiveFields },
      });
    }
    return redactHiddenFields(contact, visibilities);
  }

  @Post()
  @RequirePermission('contact', 'write')
  @ApiOkResponse({ type: ContactResponseDto })
  async create(@Body() dto: CreateContactDto, @CurrentUser() user: AuthenticatedUser): Promise<ContactResponseDto> {
    assertExactlyOneParent(dto.accountId, dto.carrierId);
    await validateCustomFields('CONTACT', dto.customFields, { isCreate: true });
    assertFieldsWritable(dto, await resolveFieldVisibilities(user, 'contact'));
    const contact = await getPrismaClient().contact.create({
      data: { ...dto, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
    await enqueueEntityEvent({
      entityType: 'CONTACT',
      entityId: contact.id,
      eventType: 'CREATED',
      occurredAt: contact.createdAt.toISOString(),
    }).catch(() => undefined);
    return contact;
  }

  @Patch(':id')
  @RequirePermission('contact', 'write')
  @ApiOkResponse({ type: ContactResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateContactDto, @CurrentUser() user: AuthenticatedUser): Promise<ContactResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contact not found');
    const nextAccountId = dto.accountId !== undefined ? dto.accountId : existing.accountId;
    const nextCarrierId = dto.carrierId !== undefined ? dto.carrierId : existing.carrierId;
    assertExactlyOneParent(nextAccountId ?? undefined, nextCarrierId ?? undefined);
    await validateCustomFields('CONTACT', dto.customFields, { isCreate: false });
    assertFieldsWritable(dto, await resolveFieldVisibilities(user, 'contact'));
    const contact = await prisma.contact.update({
      where: { id },
      data: { ...dto, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
    await enqueueEntityEvent({
      entityType: 'CONTACT',
      entityId: contact.id,
      eventType: 'UPDATED',
      occurredAt: contact.updatedAt.toISOString(),
    }).catch(() => undefined);
    return contact;
  }

  @Delete(':id')
  @RequirePermission('contact', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contact not found');
    await prisma.contact.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('bulk/assign')
  @RequirePermission('contact', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkAssign(@Body() dto: BulkAssignContactsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    // Carrier-linked contacts (carrierId set) are excluded — setting
    // accountId on them would leave both accountId and carrierId set,
    // violating contacts_exactly_one_parent. They land in `skipped`
    // alongside ids outside RLS scope, same as any other out-of-scope id.
    const eligible = await prisma.contact.findMany({ where: { id: { in: dto.ids }, carrierId: null }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, eligible.map((c) => c.id));
    if (matched.length > 0) {
      await prisma.contact.updateMany({ where: { id: { in: matched } }, data: { accountId: dto.accountId } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post('bulk/update')
  @RequirePermission('contact', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkUpdate(@Body() dto: BulkUpdateContactsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.contact.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((c) => c.id));
    if (matched.length > 0) {
      await prisma.contact.updateMany({ where: { id: { in: matched } }, data: { title: dto.title, isPrimary: dto.isPrimary } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post('bulk/delete')
  @RequirePermission('contact', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkDelete(@Body() dto: BulkDeleteContactsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.contact.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((c) => c.id));
    if (matched.length > 0) {
      await prisma.contact.deleteMany({ where: { id: { in: matched } } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post(':id/merge')
  @RequirePermission('contact', 'write')
  @ApiOkResponse({ type: MergeResponseDto })
  async merge(@Param('id') id: string, @Body() dto: MergeRequestDto): Promise<MergeResponseDto> {
    return mergeContacts(id, dto.loserId);
  }
}

function assertExactlyOneParent(accountId?: string, carrierId?: string): void {
  if (Boolean(accountId) === Boolean(carrierId)) {
    throw new BadRequestException('Exactly one of accountId/carrierId must be set');
  }
}

/**
 * Shared by list/count/stats/export so all four agree on what the current
 * filter selects — same contract as accountListWhere()/leadListWhere().
 *
 * The OR is only added when `q` is present: an empty `OR: []` matches NOTHING
 * in Prisma, which would silently return zero rows for every unfiltered call.
 */
function contactListWhere(query: ContactQueryDto): Prisma.ContactWhereInput {
  const q = query.q?.trim();
  return {
    accountId: query.accountId,
    carrierId: query.carrierId,
    // Explicit string comparison — see AccountQueryDto.includeArchived.
    // undefined (param absent) must stay undefined so the filter is skipped,
    // rather than collapsing to `false` and hiding every primary contact.
    isPrimary: query.isPrimary === undefined ? undefined : query.isPrimary === 'true',
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q, mode: 'insensitive' as const } },
            { title: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}
