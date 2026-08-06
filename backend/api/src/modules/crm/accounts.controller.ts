import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  AccountQueryDto,
  BulkAssignAccountsDto,
  BulkDeleteAccountsDto,
  BulkUpdateAccountsDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';
import { AccountDetailResponseDto, AccountRenewalRowDto, AccountResponseDto } from './dto/account-response.dto';
import { AccountSlaOverrideResponseDto, UpsertAccountSlaOverrideDto } from './dto/account-sla-override.dto';
import {
  AccountRelationshipResponseDto,
  CreateAccountRelationshipDto,
  UpdateAccountRelationshipDto,
} from './dto/account-relationship.dto';
import { BulkActionResponseDto } from './dto/bulk-action.dto';
import { CheckAccountDuplicatesQueryDto, DuplicateGroupDto } from './dto/duplicate-check.dto';
import { MergeRequestDto, MergeResponseDto } from './dto/merge.dto';
import { validateCustomFields } from './custom-fields.validator';
import { diffBulkIds } from './bulk-actions';
import { checkAccountDuplicates } from './duplicate-detection';
import { mergeAccounts } from './merge';
import { decimalToString } from '../policy/decimal.util';

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

  // Must precede ':id' — Nest matches literal segments in declaration order
  // ahead of a dynamic param competing for the same position (see
  // tasks.controller.ts's 'mine' route for the same precedent).
  @Get('check-duplicates')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [DuplicateGroupDto] })
  async checkDuplicates(@Query() query: CheckAccountDuplicatesQueryDto): Promise<DuplicateGroupDto[]> {
    return checkAccountDuplicates(query);
  }

  @Get(':id')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: AccountDetailResponseDto })
  async getOne(@Param('id') id: string): Promise<AccountDetailResponseDto> {
    const prisma = getPrismaClient();
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        contacts: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, title: true, isPrimary: true },
        },
        _count: { select: { opportunities: true, tasks: true, policies: true, activities: true, relationshipsAsA: true, relationshipsAsB: true } },
      },
    });
    if (!account) throw new NotFoundException('Account not found');

    // Roll-up sums — previously nowhere visible at the account level even
    // though every figure is already tracked per-Policy/-Premium/
    // -Opportunity. Three independent aggregates (not a single query) since
    // they span three different tables joined back to this one account.
    const [policyAgg, premiumAgg, opportunityAgg] = await Promise.all([
      prisma.policy.aggregate({ where: { accountId: id }, _sum: { sumInsured: true } }),
      prisma.premium.aggregate({ where: { policy: { accountId: id } }, _sum: { grossPremium: true, paidAmount: true } }),
      prisma.opportunity.aggregate({ where: { accountId: id, pipelineStage: { isWon: true } }, _sum: { amount: true } }),
    ]);
    const grossPremium = premiumAgg._sum.grossPremium;
    const paidPremium = premiumAgg._sum.paidAmount;

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
      financials: {
        totalSumInsured: decimalToString(policyAgg._sum.sumInsured),
        totalGrossPremium: decimalToString(grossPremium),
        totalOutstandingPremium: grossPremium && paidPremium ? grossPremium.minus(paidPremium).toString() : decimalToString(grossPremium),
        wonOpportunityValue: decimalToString(opportunityAgg._sum.amount),
      },
    };
  }

  // Must precede nothing in particular re: ':id' — this has an extra path
  // segment (`:id/renewals`), so it can't collide with the single-segment
  // `:id` route above regardless of declaration order.
  @Get(':id/renewals')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [AccountRenewalRowDto] })
  async listRenewals(@Param('id') id: string): Promise<AccountRenewalRowDto[]> {
    const policies = await getPrismaClient().policy.findMany({
      where: { accountId: id },
      select: {
        id: true,
        policyNumber: true,
        status: true,
        expiryDate: true,
        renewalSchedule: { select: { status: true, renewalDueDate: true, nextAlertDueAt: true, assignedToId: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
    return policies.map((p) => ({
      policyId: p.id,
      policyNumber: p.policyNumber,
      policyStatus: p.status,
      expiryDate: p.expiryDate,
      renewalStatus: p.renewalSchedule?.status ?? null,
      renewalDueDate: p.renewalSchedule?.renewalDueDate ?? null,
      nextAlertDueAt: p.renewalSchedule?.nextAlertDueAt ?? null,
      assignedToId: p.renewalSchedule?.assignedToId ?? null,
    }));
  }

  // Same gate as sla-policies.controller.ts — SLA config is an ALL-scope
  // capability regardless of who owns the account being configured.
  @Get(':id/sla-overrides')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [AccountSlaOverrideResponseDto] })
  async listSlaOverrides(@Param('id') id: string): Promise<AccountSlaOverrideResponseDto[]> {
    const overrides = await getPrismaClient().accountSlaOverride.findMany({
      where: { accountId: id },
      include: { slaPolicy: { select: { name: true } } },
    });
    return overrides.map((o) => ({
      id: o.id,
      accountId: o.accountId,
      entityType: o.entityType,
      slaPolicyId: o.slaPolicyId,
      slaPolicyName: o.slaPolicy.name,
    }));
  }

  @Put(':id/sla-overrides')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: AccountSlaOverrideResponseDto })
  async upsertSlaOverride(@Param('id') id: string, @Body() dto: UpsertAccountSlaOverrideDto): Promise<AccountSlaOverrideResponseDto> {
    const prisma = getPrismaClient();
    const account = await prisma.account.findUnique({ where: { id }, select: { id: true } });
    if (!account) throw new NotFoundException('Account not found');
    const policy = await prisma.slaPolicy.findUnique({ where: { id: dto.slaPolicyId } });
    if (!policy) throw new NotFoundException('SLA policy not found');
    if (policy.entityType !== dto.entityType) {
      throw new BadRequestException(`SLA policy ${policy.id} is for ${policy.entityType}, not ${dto.entityType}`);
    }
    const override = await prisma.accountSlaOverride.upsert({
      where: { accountId_entityType: { accountId: id, entityType: dto.entityType } },
      create: { accountId: id, entityType: dto.entityType, slaPolicyId: dto.slaPolicyId },
      update: { slaPolicyId: dto.slaPolicyId },
    });
    return { id: override.id, accountId: override.accountId, entityType: override.entityType, slaPolicyId: override.slaPolicyId, slaPolicyName: policy.name };
  }

  @Delete(':id/sla-overrides/:entityType')
  @RequirePermission('sla_config', 'write')
  async removeSlaOverride(@Param('id') id: string, @Param('entityType') entityType: string): Promise<{ deleted: boolean }> {
    try {
      await getPrismaClient().accountSlaOverride.delete({
        where: { accountId_entityType: { accountId: id, entityType: entityType as never } },
      });
      return { deleted: true };
    } catch {
      // RLS hides rows outside scope the same way a genuinely-missing row
      // does — Prisma's delete throws P2025 either way; both map to 404.
      throw new NotFoundException('SLA override not found');
    }
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AccountResponseDto })
  async create(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthenticatedUser): Promise<AccountResponseDto> {
    await validateCustomFields('ACCOUNT', dto.customFields, { isCreate: true });
    return getPrismaClient().account.create({
      data: { ...dto, ownerId: dto.ownerId ?? user.id, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AccountResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto): Promise<AccountResponseDto> {
    const existing = await getPrismaClient().account.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Account not found');
    await validateCustomFields('ACCOUNT', dto.customFields, { isCreate: false });
    return getPrismaClient().account.update({
      where: { id },
      data: { ...dto, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const existing = await getPrismaClient().account.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Account not found');
    await getPrismaClient().account.delete({ where: { id } });
    return { deleted: true };
  }

  // Bulk endpoints — updateMany/deleteMany fire the audit trigger once per
  // affected row automatically (Prisma's compiled form, not raw SQL), so no
  // manual audit call here (same as opportunities.controller.ts's
  // updateStage()). RLS restricts updateMany/deleteMany to rows in scope;
  // requested ids outside that scope land in `skipped`, never silently
  // dropped — the pre-check findMany below is what makes that diff possible.
  @Post('bulk/assign')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkAssign(@Body() dto: BulkAssignAccountsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.account.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((a) => a.id));
    if (matched.length > 0) {
      await prisma.account.updateMany({ where: { id: { in: matched } }, data: { ownerId: dto.ownerId } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post('bulk/update')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkUpdate(@Body() dto: BulkUpdateAccountsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.account.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((a) => a.id));
    if (matched.length > 0) {
      await prisma.account.updateMany({
        where: { id: { in: matched } },
        data: { status: dto.status, riskRating: dto.riskRating, ownerId: dto.ownerId, industryId: dto.industryId },
      });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post('bulk/delete')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkDelete(@Body() dto: BulkDeleteAccountsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.account.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((a) => a.id));
    if (matched.length > 0) {
      await prisma.account.deleteMany({ where: { id: { in: matched } } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post(':id/merge')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: MergeResponseDto })
  async merge(@Param('id') id: string, @Body() dto: MergeRequestDto): Promise<MergeResponseDto> {
    return mergeAccounts(id, dto.loserId);
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
