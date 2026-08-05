import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AgentWorkloadDto, CaseKpiQueryDto, CaseKpiResponseDto, CaseStatusCountDto, CaseVolumeTrendPointDto } from './dto/case-kpi-response.dto';

const OPEN_STATUSES = ['NEW', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_CARRIER', 'REOPENED'] as const;

function avgHoursBetween(rows: Array<{ start: Date; end: Date | null }>): number | null {
  const durations = rows.filter((r): r is { start: Date; end: Date } => r.end !== null).map((r) => (r.end.getTime() - r.start.getTime()) / 3_600_000);
  if (durations.length === 0) return null;
  return Math.round((durations.reduce((sum, d) => sum + d, 0) / durations.length) * 10) / 10;
}

/**
 * Sibling to DashboardsController's operational-kpis (sales-scoped) — this
 * one is case/ticket-scoped (response/resolution time, SLA compliance,
 * volume trend, agent workload), gated on `case:read` rather than being
 * ungated like the sales dashboard, since case data is more
 * access-sensitive. One query per metric, aggregated in JS — same
 * convention as getSalesForecast/getOperationalKpis in dashboards.controller.ts.
 */
@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('dashboards/case-kpis')
export class CaseKpisController {
  @Get()
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: CaseKpiResponseDto })
  async getCaseKpis(@Query() query: CaseKpiQueryDto): Promise<CaseKpiResponseDto> {
    const prisma = getPrismaClient();
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [windowCases, statusGroups, slaClocks, openAssignedGroups] = await Promise.all([
      prisma.case.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, firstRespondedAt: true, resolvedAt: true },
      }),
      prisma.case.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.slaClock.findMany({
        where: { caseId: { not: null }, case: { createdAt: { gte: since } } },
        select: { status: true },
      }),
      prisma.case.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { not: null }, status: { in: [...OPEN_STATUSES] } },
        _count: { _all: true },
      }),
    ]);

    const avgFirstResponseHours = avgHoursBetween(windowCases.map((c) => ({ start: c.createdAt, end: c.firstRespondedAt })));
    const avgResolutionHours = avgHoursBetween(windowCases.map((c) => ({ start: c.createdAt, end: c.resolvedAt })));

    const slaBreachRatePercent = slaClocks.length === 0 ? null : Math.round((slaClocks.filter((s) => s.status === 'BREACHED').length / slaClocks.length) * 1000) / 10;

    const openCaseCountByStatus: CaseStatusCountDto[] = statusGroups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    const trendBuckets = new Map<string, number>();
    for (const c of windowCases) {
      const key = c.createdAt.toISOString().slice(0, 10);
      trendBuckets.set(key, (trendBuckets.get(key) ?? 0) + 1);
    }
    const caseVolumeTrend: CaseVolumeTrendPointDto[] = [...trendBuckets.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const agentIds = openAssignedGroups.map((g) => g.assignedToId).filter((id): id is string => id !== null);
    const agents = agentIds.length === 0 ? [] : await prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, fullName: true } });
    const agentNameById = new Map(agents.map((a) => [a.id, a.fullName]));
    const agentWorkload: AgentWorkloadDto[] = openAssignedGroups
      .map((g) => ({ userId: g.assignedToId as string, userName: agentNameById.get(g.assignedToId as string) ?? 'Unknown', openCaseCount: g._count._all }))
      .sort((a, b) => b.openCaseCount - a.openCaseCount);

    return { days, avgFirstResponseHours, avgResolutionHours, slaBreachRatePercent, openCaseCountByStatus, caseVolumeTrend, agentWorkload };
  }
}
