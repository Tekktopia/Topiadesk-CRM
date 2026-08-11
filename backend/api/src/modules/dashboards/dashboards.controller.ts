import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type RenewalStatus } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { DepartmentPipelineBreakdownDto, LossReasonBreakdownDto, OperationalKpiQueryDto, OperationalKpiResponseDto } from './dto/operational-kpi-response.dto';
import { SalesForecastGroupDto, SalesForecastQueryDto, SalesForecastResponseDto } from './dto/sales-forecast.dto';
import { RenewalForecastGroupDto, RenewalForecastQueryDto, RenewalForecastResponseDto } from './dto/renewal-forecast.dto';
import { DealsProjectionMonthDto, DealsTrendMonthDto, DealsTrendResponseDto } from './dto/deals-trend.dto';
import { loadExchangeRates, toBaseCurrency } from './currency.util';

/**
 * No `Opportunity.probability` equivalent exists on RenewalSchedule — this
 * is an invented status->confidence scale (not derived from any stored
 * field), same spirit as StageHistoryCard's stage-derived confidence
 * elsewhere in the app. RENEWED/DECLINED_TO_RENEW/LAPSED are terminal
 * (100%/0%/0% — already decided, nothing left to weight); ON_TRACK and
 * IN_PROGRESS both get 75% (genuinely in motion, no signal either way yet
 * to differentiate them further); AT_RISK gets 25% (still possible, but
 * the flagged case).
 */
const RENEWAL_STATUS_WEIGHTS: Record<RenewalStatus, number> = {
  ON_TRACK: 0.75,
  IN_PROGRESS: 0.75,
  AT_RISK: 0.25,
  RENEWED: 1,
  LAPSED: 0,
  DECLINED_TO_RENEW: 0,
};

/**
 * Foundation home-screen KPI tile — every Phase-1 module needs a landing
 * view, so this is genuinely in scope now rather than deferred. The full
 * "Reporting, Analytics & AI" module (executive/technical/sales/compliance
 * dashboards, drill-down, ad-hoc report builder, export) is Phase 3 —
 * see docs/roadmap-phase2-3.md. SavedDashboard widgets must reference
 * fixed server-defined report keys with typed filters, never raw query
 * strings from the frontend — do not build a generic query builder here.
 */
@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('dashboards/operational-kpis')
export class DashboardsController {
  @Get()
  @ApiOkResponse({ type: OperationalKpiResponseDto })
  async getOperationalKpis(@Query() query: OperationalKpiQueryDto): Promise<OperationalKpiResponseDto> {
    const prisma = getPrismaClient();
    const in90Days = new Date();
    in90Days.setDate(in90Days.getDate() + 90);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    // ownerId/lineOfBusiness scope every opportunity-derived number below
    // (open pipeline, won-this-month, win rate, by-department, loss
    // reasons) — the same filter shape OpportunityQueryDto already accepts
    // on GET /crm/opportunities, reused here rather than inventing a
    // parallel filter vocabulary. renewalsDueNext90Days/activeClients stay
    // unfiltered: RenewalSchedule/Account status counts, not an
    // Opportunity-shaped query, so ownerId/lineOfBusiness has no honest
    // meaning there.
    const scopeFilter = {
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.lineOfBusiness ? { lineOfBusiness: query.lineOfBusiness } : {}),
    };

    const [openOpportunities, renewalsDueNext90Days, activeClients, wonThisMonth, wonAllTime, lostAllTime, departments, exchangeRates] = await Promise.all([
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: false, isLost: false }, ...scopeFilter },
        select: { amount: true, currency: true, owner: { select: { departmentId: true } } },
      }),
      prisma.renewalSchedule.count({ where: { renewalDueDate: { lte: in90Days } } }),
      prisma.account.count({ where: { status: 'CLIENT' } }),
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: true }, actualCloseDate: { gte: monthStart, lte: monthEnd }, ...scopeFilter },
        select: { amount: true, currency: true, owner: { select: { departmentId: true } } },
      }),
      prisma.opportunity.count({ where: { pipelineStage: { isWon: true }, actualCloseDate: { not: null }, ...scopeFilter } }),
      prisma.opportunity.findMany({
        where: { pipelineStage: { isLost: true }, actualCloseDate: { not: null }, ...scopeFilter },
        select: { lostReason: true },
      }),
      prisma.department.findMany({ select: { id: true, name: true } }),
      loadExchangeRates(),
    ]);
    // Every raw money sum below normalizes each row into the org's base
    // currency first (see currency.util.ts) — Opportunity.amount can be
    // NGN, USD, or anything else an admin has configured a rate for (see
    // ExchangeRate), so summing the raw Decimal values directly would
    // silently mix currencies into one meaningless total.
    const baseAmount = (o: { amount: unknown; currency: string }) => toBaseCurrency(Number(o.amount), o.currency, exchangeRates);

    const pipelineValue = openOpportunities.reduce((sum: number, o) => sum + baseAmount(o), 0);
    const wonThisMonthValue = wonThisMonth.reduce((sum: number, o) => sum + baseAmount(o), 0);
    const decidedAllTime = wonAllTime + lostAllTime.length;

    const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));
    const byDeptTotals = new Map<string, { openCount: number; openValue: number; wonCount: number; wonValue: number }>();
    const getTotals = (deptId: string) => {
      const existing = byDeptTotals.get(deptId);
      if (existing) return existing;
      const fresh = { openCount: 0, openValue: 0, wonCount: 0, wonValue: 0 };
      byDeptTotals.set(deptId, fresh);
      return fresh;
    };
    for (const o of openOpportunities) {
      const deptId = o.owner?.departmentId;
      if (!deptId) continue;
      const totals = getTotals(deptId);
      totals.openCount++;
      totals.openValue += baseAmount(o);
    }
    for (const o of wonThisMonth) {
      const deptId = o.owner?.departmentId;
      if (!deptId) continue;
      const totals = getTotals(deptId);
      totals.wonCount++;
      totals.wonValue += baseAmount(o);
    }
    const byDepartment: DepartmentPipelineBreakdownDto[] = [...byDeptTotals.entries()]
      .map(([departmentId, t]) => ({
        departmentId,
        departmentName: departmentNameById.get(departmentId) ?? 'Unknown',
        openOpportunityCount: t.openCount,
        pipelineValue: t.openValue.toFixed(2),
        wonThisMonthCount: t.wonCount,
        wonThisMonthValue: t.wonValue.toFixed(2),
      }))
      .sort((a, b) => Number(b.pipelineValue) - Number(a.pipelineValue));

    // Top 5 lost reasons by count + an "Other" bucket for the rest — same
    // cap-and-fold shape the Reports module's pie/donut cap uses
    // (report-chart.tsx's capToTopCategories), computed server-side here
    // since this is a fixed KPI response, not a user-adjustable report.
    const reasonCounts = new Map<string, number>();
    for (const o of lostAllTime) {
      const reason = o.lostReason?.trim() || 'Unspecified';
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    const rankedReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
    const otherCount = rankedReasons.slice(5).reduce((sum, [, count]) => sum + count, 0);
    const lossReasonBreakdown: LossReasonBreakdownDto[] = [
      ...rankedReasons.slice(0, 5).map(([reason, count]) => ({ reason, count })),
      ...(otherCount > 0 ? [{ reason: 'Other', count: otherCount }] : []),
    ];

    return {
      openOpportunities: openOpportunities.length,
      pipelineValue: pipelineValue.toFixed(2),
      renewalsDueNext90Days,
      activeClients,
      wonThisMonthCount: wonThisMonth.length,
      wonThisMonthValue: wonThisMonthValue.toFixed(2),
      winRate: decidedAllTime > 0 ? wonAllTime / decidedAllTime : null,
      byDepartment,
      lossReasonBreakdown,
    };
  }

  // Weighted/unweighted pipeline totals for the current month/quarter,
  // grouped in JS after one findMany (same style as getOperationalKpis'
  // reduce above) rather than a Prisma groupBy — groupBy can't easily
  // express "sum(amount * probability/100)" or join through to a display
  // label (owner.fullName / pipelineStage.name) in one query. No new
  // schema needed, confirmed by the approved research spec: this is a pure
  // aggregation over Opportunity/PipelineStage.
  @Get('sales-forecast')
  @ApiOkResponse({ type: SalesForecastResponseDto })
  async getSalesForecast(@Query() query: SalesForecastQueryDto): Promise<SalesForecastResponseDto> {
    const prisma = getPrismaClient();
    const { periodStart, periodEnd, periodLabel } = resolvePeriod(query.period ?? 'quarter', new Date());

    const [opportunities, exchangeRates] = await Promise.all([
      prisma.opportunity.findMany({
        where: {
          expectedCloseDate: { gte: periodStart, lte: periodEnd },
          ownerId: query.ownerId,
          lineOfBusiness: query.lineOfBusiness,
          pipelineStage: query.pipelineId !== undefined ? { isWon: false, isLost: false, pipelineId: query.pipelineId } : { isWon: false, isLost: false },
        },
        select: {
          amount: true,
          currency: true,
          probability: true,
          ownerId: true,
          lineOfBusiness: true,
          pipelineStage: { select: { id: true, name: true } },
          owner: { select: { fullName: true } },
        },
      }),
      loadExchangeRates(),
    ]);

    const groupBy = query.groupBy ?? 'owner';
    const groups = new Map<string, { label: string | null; count: number; weighted: number; unweighted: number }>();
    for (const o of opportunities) {
      // Normalized to the org base currency before weighting/summing —
      // see currency.util.ts.
      const amount = toBaseCurrency(Number(o.amount), o.currency, exchangeRates);
      const weighted = amount * (o.probability / 100);
      const [key, label] =
        groupBy === 'owner'
          ? [o.ownerId, o.owner.fullName]
          : groupBy === 'stage'
            ? [o.pipelineStage.id, o.pipelineStage.name]
            : [o.lineOfBusiness ?? 'UNSPECIFIED', o.lineOfBusiness];
      const g = groups.get(key) ?? { label, count: 0, weighted: 0, unweighted: 0 };
      g.count += 1;
      g.weighted += weighted;
      g.unweighted += amount;
      groups.set(key, g);
    }

    const groupDtos: SalesForecastGroupDto[] = [...groups.entries()].map(([key, g]) => ({
      key,
      label: g.label,
      count: g.count,
      weightedAmount: g.weighted.toFixed(2),
      unweightedAmount: g.unweighted.toFixed(2),
    }));

    return {
      period: periodLabel,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      groups: groupDtos,
      totalWeightedAmount: groupDtos.reduce((sum, g) => sum + Number(g.weightedAmount), 0).toFixed(2),
      totalUnweightedAmount: groupDtos.reduce((sum, g) => sum + Number(g.unweightedAmount), 0).toFixed(2),
    };
  }

  // Renewal counterpart to getSalesForecast above — same shape (one
  // findMany + in-JS Map grouping, period resolved the same way), weighted
  // by RENEWAL_STATUS_WEIGHTS instead of a stored probability field (see
  // that const's own comment for why), using each policy's most recent
  // Premium.grossPremium as "renewal revenue" — same field
  // renewal-pipeline-by-carrier.ts (packages/reports) already established
  // as this codebase's "premium at stake" precedent, not Policy.sumInsured
  // (coverage amount, not premium).
  @Get('renewal-forecast')
  @ApiOkResponse({ type: RenewalForecastResponseDto })
  async getRenewalForecast(@Query() query: RenewalForecastQueryDto): Promise<RenewalForecastResponseDto> {
    const prisma = getPrismaClient();
    const { periodStart, periodEnd, periodLabel } = resolvePeriod(query.period ?? 'quarter', new Date());

    const schedules = await prisma.renewalSchedule.findMany({
      where: {
        renewalDueDate: { gte: periodStart, lte: periodEnd },
        assignedToId: query.ownerId,
        policy: query.lineOfBusiness ? { lineOfBusiness: query.lineOfBusiness } : undefined,
      },
      select: {
        status: true,
        assignedToId: true,
        assignedTo: { select: { fullName: true } },
        policy: {
          select: {
            lineOfBusiness: true,
            premiums: { orderBy: { dueDate: 'desc' }, take: 1, select: { grossPremium: true } },
          },
        },
      },
    });

    const groupBy = query.groupBy ?? 'status';
    const groups = new Map<string, { label: string | null; count: number; weighted: number; unweighted: number }>();
    let atRisk = 0;
    for (const s of schedules) {
      const premium = Number(s.policy.premiums[0]?.grossPremium ?? 0);
      const weighted = premium * RENEWAL_STATUS_WEIGHTS[s.status];
      if (s.status === 'AT_RISK') atRisk += premium;
      const [key, label]: [string, string | null] =
        groupBy === 'owner'
          ? [s.assignedToId ?? 'UNASSIGNED', s.assignedTo?.fullName ?? 'Unassigned']
          : groupBy === 'lineOfBusiness'
            ? [s.policy.lineOfBusiness, s.policy.lineOfBusiness]
            : [s.status, s.status];
      const g = groups.get(key) ?? { label, count: 0, weighted: 0, unweighted: 0 };
      g.count += 1;
      g.weighted += weighted;
      g.unweighted += premium;
      groups.set(key, g);
    }

    const groupDtos: RenewalForecastGroupDto[] = [...groups.entries()].map(([key, g]) => ({
      key,
      label: g.label,
      count: g.count,
      weightedAmount: g.weighted.toFixed(2),
      unweightedAmount: g.unweighted.toFixed(2),
    }));

    return {
      period: periodLabel,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      groups: groupDtos,
      totalWeightedAmount: groupDtos.reduce((sum, g) => sum + Number(g.weightedAmount), 0).toFixed(2),
      totalUnweightedAmount: groupDtos.reduce((sum, g) => sum + Number(g.unweightedAmount), 0).toFixed(2),
      atRiskAmount: atRisk.toFixed(2),
    };
  }

  // Same "one findMany + in-JS Map grouping" style as getSalesForecast above
  // (month-bucketing from a Date column isn't groupBy-friendly). Every one
  // of the 24 months is walked explicitly so empty months still appear as
  // zero-value buckets — a line chart needs a continuous month axis, unlike
  // getSalesForecast's single-period grouping.
  @Get('deals-trend')
  @ApiOkResponse({ type: DealsTrendResponseDto })
  async getDealsTrend(): Promise<DealsTrendResponseDto> {
    const prisma = getPrismaClient();
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const trailingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const forwardEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, 0));

    const [won, open, exchangeRates] = await Promise.all([
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: true }, actualCloseDate: { gte: trailingStart } },
        select: { amount: true, currency: true, actualCloseDate: true },
      }),
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: false, isLost: false }, expectedCloseDate: { gte: currentMonthStart, lte: forwardEnd } },
        select: { amount: true, currency: true, probability: true, expectedCloseDate: true },
      }),
      loadExchangeRates(),
    ]);

    const wonByMonth = new Map<string, { count: number; amount: number }>();
    for (const o of won) {
      if (!o.actualCloseDate) continue;
      const key = monthKey(o.actualCloseDate);
      const bucket = wonByMonth.get(key) ?? { count: 0, amount: 0 };
      bucket.count += 1;
      bucket.amount += toBaseCurrency(Number(o.amount), o.currency, exchangeRates);
      wonByMonth.set(key, bucket);
    }

    const openByMonth = new Map<string, { count: number; weighted: number; unweighted: number }>();
    for (const o of open) {
      const key = monthKey(o.expectedCloseDate);
      const bucket = openByMonth.get(key) ?? { count: 0, weighted: 0, unweighted: 0 };
      const amount = toBaseCurrency(Number(o.amount), o.currency, exchangeRates);
      bucket.count += 1;
      bucket.weighted += amount * (o.probability / 100);
      bucket.unweighted += amount;
      openByMonth.set(key, bucket);
    }

    const trailing: DealsTrendMonthDto[] = monthRange(trailingStart, 12).map((key) => {
      const bucket = wonByMonth.get(key) ?? { count: 0, amount: 0 };
      return { month: key, wonCount: bucket.count, wonAmount: bucket.amount.toFixed(2) };
    });

    const forward: DealsProjectionMonthDto[] = monthRange(currentMonthStart, 12).map((key) => {
      const bucket = openByMonth.get(key) ?? { count: 0, weighted: 0, unweighted: 0 };
      return { month: key, count: bucket.count, weightedAmount: bucket.weighted.toFixed(2), unweightedAmount: bucket.unweighted.toFixed(2) };
    });

    return { trailing, forward };
  }
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(start: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))));
}

function resolvePeriod(period: 'month' | 'quarter', now: Date): { periodStart: Date; periodEnd: Date; periodLabel: string } {
  const year = now.getUTCFullYear();
  if (period === 'month') {
    const month = now.getUTCMonth();
    return {
      periodStart: new Date(Date.UTC(year, month, 1)),
      periodEnd: new Date(Date.UTC(year, month + 1, 0)),
      periodLabel: `${year}-${String(month + 1).padStart(2, '0')}`,
    };
  }
  const quarter = Math.floor(now.getUTCMonth() / 3);
  return {
    periodStart: new Date(Date.UTC(year, quarter * 3, 1)),
    periodEnd: new Date(Date.UTC(year, quarter * 3 + 3, 0)),
    periodLabel: `${year}-Q${quarter + 1}`,
  };
}
