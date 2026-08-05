import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  BulkAssignContactsDto,
  BulkDeleteContactsDto,
  BulkUpdateContactsDto,
  ContactQueryDto,
  ContactResponseDto,
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

/** Gated on 'account' — no dedicated 'contact' permission resource is seeded (see crm module report). */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/contacts')
export class ContactsController {
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [ContactResponseDto] })
  async list(@Query() query: ContactQueryDto): Promise<ContactResponseDto[]> {
    return getPrismaClient().contact.findMany({
      where: { accountId: query.accountId, carrierId: query.carrierId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  // Must precede ':id' — Nest matches literal segments in declaration order
  // ahead of a dynamic param competing for the same position.
  @Get('check-duplicates')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [DuplicateGroupDto] })
  async checkDuplicates(@Query() query: CheckContactDuplicatesQueryDto): Promise<DuplicateGroupDto[]> {
    return checkContactDuplicates(query);
  }

  @Get(':id')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: ContactResponseDto })
  async getOne(@Param('id') id: string): Promise<ContactResponseDto> {
    const contact = await getPrismaClient().contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: ContactResponseDto })
  async create(@Body() dto: CreateContactDto): Promise<ContactResponseDto> {
    assertExactlyOneParent(dto.accountId, dto.carrierId);
    await validateCustomFields('CONTACT', dto.customFields, { isCreate: true });
    return getPrismaClient().contact.create({
      data: { ...dto, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: ContactResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateContactDto): Promise<ContactResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contact not found');
    const nextAccountId = dto.accountId !== undefined ? dto.accountId : existing.accountId;
    const nextCarrierId = dto.carrierId !== undefined ? dto.carrierId : existing.carrierId;
    assertExactlyOneParent(nextAccountId ?? undefined, nextCarrierId ?? undefined);
    await validateCustomFields('CONTACT', dto.customFields, { isCreate: false });
    return prisma.contact.update({
      where: { id },
      data: { ...dto, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contact not found');
    await prisma.contact.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('bulk/assign')
  @RequirePermission('account', 'write')
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
  @RequirePermission('account', 'write')
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
  @RequirePermission('account', 'write')
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
  @RequirePermission('account', 'write')
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
