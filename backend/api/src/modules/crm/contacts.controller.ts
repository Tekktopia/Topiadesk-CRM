import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { ContactQueryDto, ContactResponseDto, CreateContactDto, UpdateContactDto } from './dto/contact.dto';

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
    return getPrismaClient().contact.create({ data: dto });
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
    return prisma.contact.update({ where: { id }, data: dto });
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
}

function assertExactlyOneParent(accountId?: string, carrierId?: string): void {
  if (Boolean(accountId) === Boolean(carrierId)) {
    throw new BadRequestException('Exactly one of accountId/carrierId must be set');
  }
}
