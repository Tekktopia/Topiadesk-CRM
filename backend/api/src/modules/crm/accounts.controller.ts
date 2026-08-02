import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AccountQueryDto, CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { AccountDetailResponseDto, AccountResponseDto } from './dto/account-response.dto';
import {
  AccountRelationshipResponseDto,
  CreateAccountRelationshipDto,
  UpdateAccountRelationshipDto,
} from './dto/account-relationship.dto';

/**
 * Account/Contact/AccountRelationship all key off 'account' — the only
 * seeded permission resource in this family (no dedicated 'contact' grant
 * exists; Contacts are always reached through an Account or Carrier).
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/accounts')
export class AccountsController {
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [AccountResponseDto] })
  async list(@Query() query: AccountQueryDto): Promise<AccountResponseDto[]> {
    // RLS (accounts_rw) restricts rows to the caller's granted scope — no
    // manual owner/department WHERE clause needed here.
    return getPrismaClient().account.findMany({
      where: {
        status: query.status,
        industryId: query.industryId,
        riskRating: query.riskRating,
        ownerId: query.ownerId,
        name: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    });
  }

  @Get(':id')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: AccountDetailResponseDto })
  async getOne(@Param('id') id: string): Promise<AccountDetailResponseDto> {
    const account = await getPrismaClient().account.findUnique({
      where: { id },
      include: {
        contacts: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, title: true, isPrimary: true },
        },
        _count: { select: { opportunities: true, tasks: true, policies: true, activities: true, relationshipsAsA: true, relationshipsAsB: true } },
      },
    });
    if (!account) throw new NotFoundException('Account not found');

    const { contacts, _count, ...rest } = account;
    return {
      ...rest,
      contacts,
      counts: {
        contacts: contacts.length,
        opportunities: _count.opportunities,
        tasks: _count.tasks,
        policies: _count.policies,
        activities: _count.activities,
        relationships: _count.relationshipsAsA + _count.relationshipsAsB,
      },
    };
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AccountResponseDto })
  async create(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthenticatedUser): Promise<AccountResponseDto> {
    return getPrismaClient().account.create({
      data: { ...dto, ownerId: dto.ownerId ?? user.id },
    });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AccountResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto): Promise<AccountResponseDto> {
    const existing = await getPrismaClient().account.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Account not found');
    return getPrismaClient().account.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const existing = await getPrismaClient().account.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Account not found');
    await getPrismaClient().account.delete({ where: { id } });
    return { deleted: true };
  }

  // Relationships are narrow FK joins keyed off accountA (see schema.prisma
  // comment) — listing surfaces both directions for this account's benefit,
  // but RLS only evaluates visibility through accountA's owner, so a
  // relationship where this account is only accountB may be hidden here
  // even though it references this account. This mirrors the RLS policy as
  // written, not a bug in this endpoint.
  @Get(':id/relationships')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [AccountRelationshipResponseDto] })
  async listRelationships(@Param('id') id: string): Promise<AccountRelationshipResponseDto[]> {
    return getPrismaClient().accountRelationship.findMany({
      where: { OR: [{ accountAId: id }, { accountBId: id }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/relationships')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AccountRelationshipResponseDto })
  async createRelationship(
    @Param('id') id: string,
    @Body() dto: CreateAccountRelationshipDto,
  ): Promise<AccountRelationshipResponseDto> {
    if (dto.relatedAccountId === id) throw new BadRequestException('An account cannot have a relationship with itself');
    return getPrismaClient().accountRelationship.create({
      data: { accountAId: id, accountBId: dto.relatedAccountId, relationshipType: dto.relationshipType, notes: dto.notes },
    });
  }
}

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/account-relationships')
export class AccountRelationshipsController {
  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AccountRelationshipResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAccountRelationshipDto): Promise<AccountRelationshipResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.accountRelationship.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AccountRelationship not found');
    return prisma.accountRelationship.update({
      where: { id },
      data: {
        relationshipType: dto.relationshipType,
        notes: dto.notes,
        accountBId: dto.relatedAccountId,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.accountRelationship.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AccountRelationship not found');
    await prisma.accountRelationship.delete({ where: { id } });
    return { deleted: true };
  }
}
