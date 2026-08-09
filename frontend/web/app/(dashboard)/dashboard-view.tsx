'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, Percent, Trophy, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatTile, Skeleton } from '@topiadesk/ui';
import { formatNaira } from '@/app/(policy)/lib/format';
import { CustomDashboardSection } from './custom-dashboard-section';
import { PipelineFunnelChart } from './pipeline-funnel-chart';
import { RenewalTimeline } from './renewal-timeline';
import { SalesForecastPanel } from './sales-forecast-panel';
import type { PipelineFunnelResponse, RenewalRow } from './types';

interface DepartmentPipelineBreakdown {
  departmentId: string;
  departmentName: string;
  openOpportunityCount: number;
  pipelineValue: string;
  wonThisMonthCount: number;
  wonThisMonthValue: string;
}

interface OperationalKpis {
  openOpportunities: number;
  pipelineValue: string;
  renewalsDueNext90Days: number;
  activeClients: number;
  wonThisMonthCount: number;
  wonThisMonthValue: string;
  winRate: number | null;
  byDepartment: DepartmentPipelineBreakdown[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Client Component doing the actual dashboard work: three independent
 * TanStack Query hooks against the same-origin app/api/dashboard/* proxies
 * (see that folder's route.ts files — StatTile icons are pre-rendered JSX
 * per packages/ui/src/composite/stat-tile.tsx's header comment, never a
 * bare component reference, to avoid the Server->Client serialization
 * crash documented there).
 */
export function DashboardView() {
  const kpisQuery = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => fetchJson<OperationalKpis>('/api/dashboard/kpis'),
  });
  const funnelQuery = useQuery({
    queryKey: ['dashboard', 'pipeline-funnel'],
    queryFn: () => fetchJson<PipelineFunnelResponse>('/api/dashboard/pipeline-funnel'),
  });
  const renewalsQuery = useQuery({
    queryKey: ['dashboard', 'renewals'],
    queryFn: () => fetchJson<RenewalRow[]>('/api/dashboard/renewals'),
  });

  const kpis = kpisQuery.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">TopiaDesk CRM</h1>
        <p className="text-sm text-muted-foreground">Operational overview — Corporate &amp; Retail Broking, Lagos HQ.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpisQuery.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-lg" />)
        ) : kpisQuery.isError || !kpis ? (
          <Card className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <CardContent className="py-6 text-sm text-destructive">Couldn&apos;t load operational KPIs.</CardContent>
          </Card>
        ) : (
          <>
            <StatTile
              label="Open opportunities"
              value={kpis.openOpportunities}
              icon={<Briefcase />}
              description="active pipeline stages"
            />
            <StatTile
              label="Pipeline value"
              value={formatNaira(kpis.pipelineValue)}
              icon={<TrendingUp />}
              description="sum of open opportunities"
            />
            <StatTile
              label="Renewals due (90d)"
              value={kpis.renewalsDueNext90Days}
              icon={<CalendarClock />}
              description="across all policies"
            />
            <StatTile label="Active clients" value={kpis.activeClients} icon={<Users />} description="accounts on CLIENT status" />
            <StatTile
              label="Won this month"
              value={kpis.wonThisMonthCount}
              icon={<Trophy />}
              description={formatNaira(kpis.wonThisMonthValue)}
            />
            <StatTile
              label="Win rate"
              value={kpis.winRate === null ? '—' : `${Math.round(kpis.winRate * 100)}%`}
              icon={<Percent />}
              description="won vs. decided, all-time"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales pipeline</CardTitle>
            <CardDescription>Open opportunities by stage, current pipeline.</CardDescription>
          </CardHeader>
          <CardContent>
            {funnelQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : funnelQuery.isError || !funnelQuery.data ? (
              <p className="text-sm text-destructive">Couldn&apos;t load the pipeline.</p>
            ) : (
              <PipelineFunnelChart stages={funnelQuery.data.stages} pipelineName={funnelQuery.data.pipelineName} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Renewals</CardTitle>
            <CardDescription>Upcoming policy renewals, soonest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {renewalsQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : renewalsQuery.isError || !renewalsQuery.data ? (
              <p className="text-sm text-destructive">Couldn&apos;t load renewals.</p>
            ) : (
              <RenewalTimeline renewals={renewalsQuery.data} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales forecast</CardTitle>
          <CardDescription>Weighted pipeline for the current period, by owner, stage, or line of business.</CardDescription>
        </CardHeader>
        <CardContent>
          <SalesForecastPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline by department</CardTitle>
          <CardDescription>Open pipeline value and deals won this month, grouped by the opportunity owner&apos;s department.</CardDescription>
        </CardHeader>
        <CardContent>
          {kpisQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !kpis || kpis.byDepartment.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No opportunities assigned to an owner with a department yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Department</th>
                    <th className="py-2 pr-4 font-medium">Open opportunities</th>
                    <th className="py-2 pr-4 font-medium">Pipeline value</th>
                    <th className="py-2 pr-4 font-medium">Won this month</th>
                    <th className="py-2 font-medium">Won value</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.byDepartment.map((d) => (
                    <tr key={d.departmentId} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground">{d.departmentName}</td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{d.openOpportunityCount}</td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{formatNaira(d.pipelineValue)}</td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{d.wonThisMonthCount}</td>
                      <td className="py-2 tabular-nums text-muted-foreground">{formatNaira(d.wonThisMonthValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CustomDashboardSection />
    </div>
  );
}
