'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlarmClockCheck, Hourglass, ShieldAlert, Timer } from 'lucide-react';
import {
  BarChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LineChart,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatTile,
} from '@topiadesk/ui';
import { formatReportValue } from '../../../(reports)/_lib/format';
import type { ReportResult } from '../../../(reports)/_lib/types';
import { caseStatusLabel } from '../../_lib/constants';

/** Same adapter pattern as (reports)/_components/report-chart.tsx's local `toDatums` — turns a one-dimension/one-measure ReportResult into the plain BarChartDatum/LineChart shape @topiadesk/ui's chart components expect. */
function toDatums(result: ReportResult, dimensionKey: string, measureKey: string) {
  const measureColumn = result.columns.find((c) => c.key === measureKey)!;
  return result.rows.map((row) => ({
    name: String(row[dimensionKey] ?? 'Unknown'),
    value: Number(row[measureKey] ?? 0),
    formattedValue: formatReportValue(measureColumn.format, row[measureKey] ?? null),
  }));
}

interface CaseKpiResponse {
  days: number;
  avgFirstResponseHours: number | null;
  avgResolutionHours: number | null;
  slaBreachRatePercent: number | null;
  openCaseCountByStatus: Array<{ status: string; count: number }>;
  caseVolumeTrend: Array<{ date: string; count: number }>;
  agentWorkload: Array<{ userId: string; userName: string; openCaseCount: number }>;
  byDepartment: Array<{ departmentId: string; departmentName: string; openCaseCount: number; slaBreachRatePercent: number | null }>;
  byTeam: Array<{ teamId: string; teamName: string; openCaseCount: number; slaBreachRatePercent: number | null }>;
}

const DAY_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  return hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(1)}h`;
}

/**
 * Case/ticket KPI dashboard — response/resolution time, SLA compliance,
 * volume trend, agent workload. Sourced from GET /api/case-kpis (proxying
 * CaseKpisController), a sibling of the sales-scoped app/(dashboard) home
 * page rather than a tab bolted onto it. Trend/workload charts reshape the
 * endpoint's plain arrays into the local ReportResult shape, then `toDatums`
 * adapts that into the plain shape @topiadesk/ui's LineChart/BarChart
 * expect — same adapter pattern (reports)/_components/report-chart.tsx uses.
 */
export function CaseDashboardView() {
  const [days, setDays] = useState('30');

  const kpisQuery = useQuery({
    queryKey: ['case-kpis', days],
    queryFn: () => fetchJson<CaseKpiResponse>(`/api/case-kpis?days=${days}`),
  });

  const kpis = kpisQuery.data;

  const trendResult: ReportResult | null = kpis
    ? {
        columns: [
          { key: 'date', label: 'Date', format: 'text' },
          { key: 'count', label: 'Tickets created', format: 'number' },
        ],
        rows: kpis.caseVolumeTrend,
        totalRowCount: kpis.caseVolumeTrend.length,
        generatedAt: new Date().toISOString(),
      }
    : null;

  const workloadResult: ReportResult | null = kpis
    ? {
        columns: [
          { key: 'userName', label: 'Agent', format: 'text' },
          { key: 'openCaseCount', label: 'Open tickets', format: 'number' },
        ],
        rows: kpis.agentWorkload,
        totalRowCount: kpis.agentWorkload.length,
        generatedAt: new Date().toISOString(),
      }
    : null;

  const byDepartmentResult: ReportResult | null = kpis
    ? {
        columns: [
          { key: 'departmentName', label: 'Department', format: 'text' },
          { key: 'openCaseCount', label: 'Open tickets', format: 'number' },
        ],
        rows: kpis.byDepartment,
        totalRowCount: kpis.byDepartment.length,
        generatedAt: new Date().toISOString(),
      }
    : null;

  const byTeamResult: ReportResult | null = kpis
    ? {
        columns: [
          { key: 'teamName', label: 'Team', format: 'text' },
          { key: 'openCaseCount', label: 'Open tickets', format: 'number' },
        ],
        rows: kpis.byTeam,
        totalRowCount: kpis.byTeam.length,
        generatedAt: new Date().toISOString(),
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ticket Dashboard</h1>
          <p className="text-sm text-muted-foreground">Response times, SLA compliance, volume trend and agent workload.</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-lg" />)
        ) : kpisQuery.isError || !kpis ? (
          <Card className="sm:col-span-2 lg:col-span-4">
            <CardContent className="py-6 text-sm text-destructive">Couldn&apos;t load case KPIs.</CardContent>
          </Card>
        ) : (
          <>
            <StatTile
              label="Avg. first response"
              value={formatHours(kpis.avgFirstResponseHours)}
              icon={<Hourglass />}
              description={`over last ${kpis.days} days`}
            />
            <StatTile
              label="Avg. resolution time"
              value={formatHours(kpis.avgResolutionHours)}
              icon={<AlarmClockCheck />}
              description={`over last ${kpis.days} days`}
            />
            <StatTile
              label="SLA breach rate"
              value={kpis.slaBreachRatePercent === null ? '—' : `${kpis.slaBreachRatePercent}%`}
              icon={<ShieldAlert />}
              description={`over last ${kpis.days} days`}
            />
            <StatTile
              label="Open tickets"
              value={kpis.openCaseCountByStatus.reduce((sum, s) => sum + s.count, 0)}
              icon={<Timer />}
              description="across all statuses, current"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ticket volume trend</CardTitle>
            <CardDescription>Tickets created per day over the selected window.</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisQuery.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : !trendResult || trendResult.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No tickets created in this window.</p>
            ) : (
              <LineChart data={toDatums(trendResult, 'date', 'count')} valueLabel="Tickets created" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open tickets by status</CardTitle>
            <CardDescription>Current snapshot, not limited to the selected window.</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisQuery.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : !kpis || kpis.openCaseCountByStatus.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <ul className="space-y-2">
                {kpis.openCaseCountByStatus.map((s) => (
                  <li key={s.status} className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{caseStatusLabel(s.status as never)}</span>
                    <span className="tabular-nums text-muted-foreground">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Agent workload</CardTitle>
            <CardDescription>Open ticket count per assigned agent, current snapshot.</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisQuery.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : !workloadResult || workloadResult.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No open tickets are currently assigned.</p>
            ) : (
              <BarChart data={toDatums(workloadResult, 'userName', 'openCaseCount')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By department</CardTitle>
            <CardDescription>Open ticket count and SLA breach rate, grouped by assignee&apos;s department.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kpisQuery.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : !byDepartmentResult || byDepartmentResult.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No open tickets currently assigned to a department.</p>
            ) : (
              <>
                <BarChart data={toDatums(byDepartmentResult, 'departmentName', 'openCaseCount')} />
                <ul className="space-y-1.5">
                  {kpis!.byDepartment.map((d) => (
                    <li key={d.departmentId} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{d.departmentName}</span>
                      <span className="tabular-nums text-muted-foreground">
                        SLA breach: {d.slaBreachRatePercent === null ? '—' : `${d.slaBreachRatePercent}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By team</CardTitle>
            <CardDescription>Open ticket count and SLA breach rate, grouped by assigned team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kpisQuery.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : !byTeamResult || byTeamResult.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No open tickets currently assigned to a team.</p>
            ) : (
              <>
                <BarChart data={toDatums(byTeamResult, 'teamName', 'openCaseCount')} />
                <ul className="space-y-1.5">
                  {kpis!.byTeam.map((t) => (
                    <li key={t.teamId} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{t.teamName}</span>
                      <span className="tabular-nums text-muted-foreground">
                        SLA breach: {t.slaBreachRatePercent === null ? '—' : `${t.slaBreachRatePercent}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
