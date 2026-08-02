import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Premium } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreatePremiumDto } from './dto/create-premium.dto';
import { UpdatePremiumDto } from './dto/update-premium.dto';
import { PremiumAgingRowDto, PremiumResponseDto } from './dto/premium-response.dto';
import { queryRawWithRlsContext } from './rls-raw-query.util';
import { decimalToString } from './decimal.util';

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
  async list(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<PremiumResponseDto[]> {
    const premiums = await getPrismaClient().premium.findMany({ where: { policyId }, orderBy: { dueDate: 'asc' } });
    return premiums.map(toPremiumDto);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PremiumResponseDto })
  async create(@Param('policyId', ParseUUIDPipe) policyId: string, @Body() dto: CreatePremiumDto): Promise<PremiumResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');

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
    return toPremiumDto(premium);
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
  @Get('aging')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PremiumAgingRowDto] })
  async aging(@Query('policyId') policyId?: string, @Query('bucket') bucket?: string): Promise<PremiumAgingRowDto[]> {
    const policyFilter = policyId ?? null;
    const bucketFilter = bucket ?? null;
    const rows = await queryRawWithRlsContext<RawAgingRow[]>`
      SELECT premium_id, policy_id, gross_premium, paid_amount, outstanding_amount, due_date, status, days_overdue, aging_bucket, refreshed_at
      FROM premium_aging_summary_scoped
      WHERE (${policyFilter}::uuid IS NULL OR policy_id = ${policyFilter}::uuid)
        AND (${bucketFilter}::text IS NULL OR aging_bucket = ${bucketFilter}::text)
      ORDER BY days_overdue DESC
      LIMIT 200
    `;
    return rows.map(toAgingDto);
  }

  @Get(':id')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: PremiumResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PremiumResponseDto> {
    const premium = await getPrismaClient().premium.findUnique({ where: { id } });
    if (!premium) throw new NotFoundException('Premium not found');
    return toPremiumDto(premium);
  }

  @Patch(':id')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PremiumResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePremiumDto): Promise<PremiumResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.premium.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Premium not found');

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
    return toPremiumDto(premium);
  }
}
