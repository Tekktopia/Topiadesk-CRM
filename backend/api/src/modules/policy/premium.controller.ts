import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Premium } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { assertFieldsWritable, redactHiddenFields, redactHiddenFieldsMany, resolveFieldVisibilities } from '../../common/field-permissions/field-visibility.util';
import { CreatePremiumDto } from './dto/create-premium.dto';
import { UpdatePremiumDto } from './dto/update-premium.dto';
import { PaystackInitializeResponseDto, PremiumAgingRowDto, PremiumResponseDto } from './dto/premium-response.dto';
import { BulkActionResponseDto, BulkMarkPremiumsPaidDto } from './dto/bulk-action.dto';
import { queryRawWithRlsContext } from './rls-raw-query.util';
import { decimalToString } from './decimal.util';
import { diffBulkIds } from './bulk-actions';
// NOT a type-only import: constructor-injected below — see the same
// footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaystackService } from '../integrations/paystack.service';

function toPremiumDto(premium: Premium): PremiumResponseDto {
  return {
    ...premium,
    grossPremium: decimalToString(premium.grossPremium),
    netPremium: decimalToString(premium.netPremium),
    commissionRate: decimalToString(premium.commissionRate),
    commissionAmount: decimalToString(premium.commissionAmount),
    paidAmount: decimalToString(premium.paidAmount),
  };
}

interface RawAgingRow {
  premium_id: string;
  policy_id: string;
  gross_premium: string;
  paid_amount: string;
  outstanding_amount: string;
  due_date: Date;
  status: string;
  days_overdue: number;
  aging_bucket: string;
  refreshed_at: Date;
}

function toAgingDto(row: RawAgingRow): PremiumAgingRowDto {
  return {
    premiumId: row.premium_id,
    policyId: row.policy_id,
    grossPremium: row.gross_premium,
    paidAmount: row.paid_amount,
    outstandingAmount: row.outstanding_amount,
    dueDate: row.due_date,
    status: row.status,
    daysOverdue: row.days_overdue,
    agingBucket: row.aging_bucket,
    refreshedAt: row.refreshed_at,
  };
}

/** Nested under a policy — list/create. Premium.policyId is set at creation and not editable afterwards. */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/premiums')
export class PolicyPremiumController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PremiumResponseDto] })
  async list(@Param('policyId', ParseUUIDPipe) policyId: string, @CurrentUser() user: AuthenticatedUser): Promise<PremiumResponseDto[]> {
    const premiums = await getPrismaClient().premium.findMany({ where: { policyId }, orderBy: { dueDate: 'asc' } });
    const visibilities = await resolveFieldVisibilities(user, 'premium');
    return redactHiddenFieldsMany(premiums.map(toPremiumDto), visibilities);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PremiumResponseDto })
  async create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreatePremiumDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PremiumResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');
    const visibilities = await resolveFieldVisibilities(user, 'premium');
    assertFieldsWritable(dto, visibilities);

    const premium = await prisma.premium.create({
      data: {
        policyId,
        policyVersionId: dto.policyVersionId,
        grossPremium: dto.grossPremium,
        netPremium: dto.netPremium,
        commissionRate: dto.commissionRate,
        commissionAmount: dto.commissionAmount,
        installmentPlan: dto.installmentPlan,
        dueDate: new Date(dto.dueDate),
      },
    });
    return redactHiddenFields(toPremiumDto(premium), visibilities);
  }
}

/**
 * Top-level premium routes: the aging report (queries
 * `premium_aging_summary_scoped`, the RLS-safe view over the
 * `premium_aging_summary` materialized view — see
 * prisma/rls/004_reporting_views.sql and rls-raw-query.util.ts for why raw
 * SQL needs the manual RLS-context wrapper here) and individual-premium
 * get/update. `aging` is registered before `:id` deliberately — Nest/Express
 * route matching is declaration-order-sensitive for overlapping patterns,
 * and ParseUUIDPipe on `:id` would otherwise 400 a request to /premiums/aging.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('premiums')
export class PremiumController {
  constructor(private readonly paystack: PaystackService) {}

  @Get('aging')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PremiumAgingRowDto] })
  async aging(
    @Query('policyId') policyId?: string,
    @Query('bucket') bucket?: string,
    @Query('search') search?: string,
  ): Promise<PremiumAgingRowDto[]> {
    const policyFilter = policyId ?? null;
    const bucketFilter = bucket ?? null;
    // The view has no policy_number column of its own (it's a plain SELECT
    // over the materialized premium_aging_summary — see
    // rls/004_reporting_views.sql) so search matches by subquery against
    // policies rather than a join; policies_rw's own RLS still governs that
    // subquery, so this can't be used to probe policy numbers outside scope.
    const searchFilter = search ? `%${search}%` : null;
    const rows = await queryRawWithRlsContext<RawAgingRow[]>`
      SELECT premium_id, policy_id, gross_premium, paid_amount, outstanding_amount, due_date, status, days_overdue, aging_bucket, refreshed_at
      FROM premium_aging_summary_scoped
      WHERE (${policyFilter}::uuid IS NULL OR policy_id = ${policyFilter}::uuid)
        AND (${bucketFilter}::text IS NULL OR aging_bucket = ${bucketFilter}::text)
        AND (${searchFilter}::text IS NULL OR policy_id IN (SELECT id FROM policies WHERE policy_number ILIKE ${searchFilter}::text))
      ORDER BY days_overdue DESC
      LIMIT 200
    `;
    return rows.map(toAgingDto);
  }

  // Batches the same fields RecordPaymentDialog already sets one row at a
  // time (paidAmount/paidDate/status) — for reconciling a bank statement
  // against several premiums at once as fully paid. Per-row loop, not
  // updateMany: paidAmount = grossPremium differs by row.
  @Post('bulk/mark-paid')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkMarkPaid(@Body() dto: BulkMarkPremiumsPaidDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.premium.findMany({ where: { id: { in: dto.ids } }, select: { id: true, grossPremium: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((p) => p.id));
    const visibleById = new Map(visible.map((p) => [p.id, p]));
    const updated: string[] = [];
    for (const id of matched) {
      const premium = visibleById.get(id);
      if (!premium) continue;
      await prisma.premium.update({ where: { id }, data: { paidAmount: premium.grossPremium, paidDate: new Date(), status: 'PAID' } });
      updated.push(id);
    }
    return { requested: dto.ids, updated, skipped };
  }

  @Get(':id')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: PremiumResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<PremiumResponseDto> {
    const premium = await getPrismaClient().premium.findUnique({ where: { id } });
    if (!premium) throw new NotFoundException('Premium not found');
    return redactHiddenFields(toPremiumDto(premium), await resolveFieldVisibilities(user, 'premium'));
  }

  @Post(':id/paystack/initialize')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PaystackInitializeResponseDto })
  async initializePaystackPayment(@Param('id', ParseUUIDPipe) id: string): Promise<PaystackInitializeResponseDto> {
    return this.paystack.initializePremiumPayment(id);
  }

  @Patch(':id')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PremiumResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePremiumDto, @CurrentUser() user: AuthenticatedUser): Promise<PremiumResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.premium.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Premium not found');
    const visibilities = await resolveFieldVisibilities(user, 'premium');
    assertFieldsWritable(dto, visibilities);

    const premium = await prisma.premium.update({
      where: { id },
      data: {
        grossPremium: dto.grossPremium,
        netPremium: dto.netPremium,
        commissionRate: dto.commissionRate,
        commissionAmount: dto.commissionAmount,
        installmentPlan: dto.installmentPlan,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        paidAmount: dto.paidAmount,
        paidDate: dto.paidDate ? new Date(dto.paidDate) : undefined,
        status: dto.status,
      },
    });
    return redactHiddenFields(toPremiumDto(premium), visibilities);
  }
}
