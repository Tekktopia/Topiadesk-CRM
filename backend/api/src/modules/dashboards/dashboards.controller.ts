import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { DepartmentPipelineBreakdownDto, OperationalKpiResponseDto } from './dto/operational-kpi-response.dto';
import { SalesForecastGroupDto, SalesForecastQueryDto, SalesForecastResponseDto } from './dto/sales-forecast.dto';

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
  async getOperationalKpis(): Promise<OperationalKpiResponseDto> {
    const prisma = getPrismaClient();
    const in90Days = new Date();
    in90Days.setDate(in90Days.getDate() + 90);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    const [openOpportunities, renewalsDueNext90Days, activeClients, wonThisMonth, wonAllTime, lostAllTime, departments] = await Promise.all([
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: false, isLost: false } },
        select: { amount: true, owner: { select: { departmentId: true } } },
      }),
      prisma.renewalSchedule.count({ where: { renewalDueDate: { lte: in90Days } } }),
      prisma.account.count({ where: { status: 'CLIENT' } }),
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: true }, actualCloseDate: { gte: monthStart, lte: monthEnd } },
        select: { amount: true, owner: { select: { departmentId: true } } },
      }),
      prisma.opportunity.count({ where: { pipelineStage: { isWon: true }, actualCloseDate: { not: null } } }),
      prisma.opportunity.count({ where: { pipelineStage: { isLost: true }, actualCloseDate: { not: null } } }),
      prisma.department.findMany({ select: { id: true, name: true } }),
    ]);

    const pipelineValue = openOpportunities.reduce((sum: number, o: { amount: unknown }) => sum + Number(o.amount), 0);
    const wonThisMonthValue = wonThisMonth.reduce((sum: number, o: { amount: unknown }) => sum + Number(o.amount), 0);
    const decidedAllTime = wonAllTime + lostAllTime;

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
      totals.openValue += Number(o.amount);
    }
    for (const o of wonThisMonth) {
      const deptId = o.owner?.departmentId;
      if (!deptId) continue;
      const totals = getTotals(deptId);
      totals.wonCount++;
      totals.wonValue += Number(o.amount);
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

    return {
      openOpportunities: openOpportunities.length,
      pipelineValue: pipelineValue.toFixed(2),
      renewalsDueNext90Days,
      activeClients,
      wonThisMonthCount: wonThisMonth.length,
      wonThisMonthValue: wonThisMonthValue.toFixed(2),
      winRate: decidedAllTime > 0 ? wonAllTime / decidedAllTime : null,
      byDepartment,
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

    const opportunities = await prisma.opportunity.findMany({
      where: {
        expectedCloseDate: { gte: periodStart, lte: periodEnd },
        ownerId: query.ownerId,
        pipelineStage: query.pipelineId !== undefined ? { isWon: false, isLost: false, pipelineId: query.pipelineId } : { isWon: false, isLost: false },
      },
      select: {
        amount: true,
        probability: true,
        ownerId: true,
        lineOfBusiness: true,
        pipelineStage: { select: { id: true, name: true } },
        owner: { select: { fullName: true } },
      },
    });

    const groupBy = query.groupBy ?? 'owner';
    const groups = new Map<string, { label: string | null; count: number; weighted: number; unweighted: number }>();
    for (const o of opportunities) {
      const amount = Number(o.amount);
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
