'use client';

import * as React from 'react';
import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarClock, LayoutGrid, Percent, Trophy, TrendingUp, Users } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  GradientStatTile,
  LineChart,
  PieChart,
  Skeleton,
  Button,
  categoricalColor,
  type BarChartDatum,
  type LineSeriesSpec,
} from '@topiadesk/ui';
import { formatNaira } from '@/app/(policy)/lib/format';
import { CustomDashboardSection } from './custom-dashboard-section';
import { PipelineFunnelChart } from './pipeline-funnel-chart';
import { RenewalTimeline } from './renewal-timeline';
import { SalesForecastPanel } from './sales-forecast-panel';
import { RenewalForecastPanel } from './renewal-forecast-panel';
import { useDealsTrend, useOperationalKpis, usePipelineFunnel, useRenewals } from './dashboard-hooks';

const GRADIENT_ACCENTS = ['violet', 'navy', 'blue', 'teal'] as const;

/** Top-N by value + a folded "Other" bucket — same cap-and-fold shape (reports)/_components/report-chart.tsx's capToTopCategories uses for pie/donut, reused here since dashboard-view.tsx calls PieChart directly rather than through that dispatcher. */
function capToTop(data: BarChartDatum[], max = 5): BarChartDatum[] {
  if (data.length <= max) return data;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const otherValue = sorted.slice(max).reduce((sum, d) => sum + d.value, 0);
  return [...sorted.slice(0, max), { name: 'Other', value: otherValue }];
}

/**
 * Client Component doing the actual dashboard work. Sourced from several
 * `app/api/dashboard/*` proxies via dashboard-hooks.ts — StatTile/
 * GradientStatTile icons are pre-rendered JSX per packages/ui/src/
 * composite/stat-tile.tsx's header comment, never a bare component
 * reference, to avoid the Server->Client serialization crash documented
 * there.
 */
export function DashboardView() {
  const kpisQuery = useOperationalKpis();
  const funnelQuery = usePipelineFunnel();
  const renewalsQuery = useRenewals();
  const trendQuery = useDealsTrend();

  const kpis = kpisQuery.data;

  const wonTrendData = React.useMemo(() => {
    const trailing = trendQuery.data?.trailing ?? [];
    const maxCount = Math.max(1, ...trailing.map((t) => t.wonCount));
    const maxAmount = Math.max(1, ...trailing.map((t) => Number(t.wonAmount)));
    return trailing.map((t) => ({
      name: t.month,
      value: 0, // unused: series mode plots wonCountIndexed/wonAmountIndexed instead, see wonTrendSeries below
      wonCountIndexed: (t.wonCount / maxCount) * 100,
      wonAmountIndexed: (Number(t.wonAmount) / maxAmount) * 100,
      wonCount: t.wonCount,
      wonAmount: t.wonAmount,
    }));
  }, [trendQuery.data]);
  const wonTrendSeries: LineSeriesSpec[] = [
    { dataKey: 'wonCountIndexed', label: 'Deals won', color: categoricalColor(0) },
    { dataKey: 'wonAmountIndexed', label: 'Value won', color: categoricalColor(2) },
  ];
  const wonTrendFormatter: ComponentProps<typeof LineChart>['formatter'] = (_value, name, item) => {
    const payload = item.payload as { wonCount: number; wonAmount: string };
    if (name === 'Deals won') return [payload.wonCount, name];
    return [formatNaira(payload.wonAmount), name];
  };

  const projectionData = React.useMemo(
    () =>
      (trendQuery.data?.forward ?? []).map((f) => ({
        name: f.month,
        value: 0, // unused: series mode plots weightedAmount/unweightedAmount instead, see projectionSeries below
        weightedAmount: Number(f.weightedAmount),
        unweightedAmount: Number(f.unweightedAmount),
      })),
    [trendQuery.data],
  );
  const projectionSeries: LineSeriesSpec[] = [
    { dataKey: 'weightedAmount', label: 'Weighted', color: categoricalColor(1) },
    { dataKey: 'unweightedAmount', label: 'Unweighted', color: categoricalColor(3) },
  ];
  const projectionFormatter: ComponentProps<typeof LineChart>['formatter'] = (_value, name, item) => {
    const payload = item.payload as { weightedAmount: number; unweightedAmount: number };
    const raw = name === 'Weighted' ? payload.weightedAmount : payload.unweightedAmount;
    return [formatNaira(raw), name];
  };

  const byDepartmentDonutData: BarChartDatum[] = kpis
    ? capToTop(kpis.byDepartment.map((d) => ({ name: d.departmentName, value: Number(d.pipelineValue), formattedValue: formatNaira(d.pipelineValue) })))
    : [];
  const lossReasonDonutData: BarChartDatum[] = kpis
    ? kpis.lossReasonBreakdown.map((r) => ({ name: r.reason, value: r.count, formattedValue: String(r.count) }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-brand-700 to-navy-700 p-6 text-white">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">TopiaDesk CRM</h1>
          <p className="text-sm text-white/80">Operational overview — Corporate &amp; Retail Broking, Lagos HQ.</p>
        </div>
        <Button
          variant="secondary"
          className="gap-1.5"
          onClick={() => document.getElementById('custom-dashboard-section')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Customize dashboard
        </Button>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpisQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-lg" />)
            ) : kpisQuery.isError || !kpis ? (
              <Card className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
                <CardContent className="py-6 text-sm text-destructive">Couldn&apos;t load operational KPIs.</CardContent>
              </Card>
            ) : (
              <>
                <Link href="/opportunities?isOpen=true" className="block rounded-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring">
                  <GradientStatTile accent={GRADIENT_ACCENTS[0]} label="Open opportunities" value={kpis.openOpportunities} icon={<Briefcase />} description="active pipeline stages" />
                </Link>
                <Link href="/opportunities?isOpen=true" className="block rounded-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring">
                  <GradientStatTile accent={GRADIENT_ACCENTS[1]} label="Pipeline value" value={formatNaira(kpis.pipelineValue)} icon={<TrendingUp />} description="sum of open opportunities" />
                </Link>
                <GradientStatTile accent={GRADIENT_ACCENTS[2]} label="Renewals due (90d)" value={kpis.renewalsDueNext90Days} icon={<CalendarClock />} description="across all policies" />
                <Link href="/accounts?status=CLIENT" className="block rounded-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring">
                  <GradientStatTile accent={GRADIENT_ACCENTS[3]} label="Active clients" value={kpis.activeClients} icon={<Users />} description="accounts on CLIENT status" />
                </Link>
                <GradientStatTile accent={GRADIENT_ACCENTS[0]} label="Won this month" value={kpis.wonThisMonthCount} icon={<Trophy />} description={formatNaira(kpis.wonThisMonthValue)} />
                <GradientStatTile
                  accent={GRADIENT_ACCENTS[1]}
                  label="Win rate"
                  value={kpis.winRate === null ? '—' : `${Math.round(kpis.winRate * 100)}%`}
                  icon={<Percent />}
                  description="won vs. decided, all-time"
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Won deals — last 12 months</CardTitle>
                <CardDescription>Deal count and value trend (each indexed to its own 12-month peak, so both are comparable on one axis).</CardDescription>
              </CardHeader>
              <CardContent>
                {trendQuery.isLoading ? (
                  <Skeleton className="h-56 w-full" />
                ) : trendQuery.isError ? (
                  <p className="text-sm text-destructive">Couldn&apos;t load the trend.</p>
                ) : (
                  <LineChart data={wonTrendData} series={wonTrendSeries} formatter={wonTrendFormatter} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deals projection — next 12 months</CardTitle>
                <CardDescription>Weighted (by stage probability) vs. unweighted pipeline value expected to close each month.</CardDescription>
              </CardHeader>
              <CardContent>
                {trendQuery.isLoading ? (
                  <Skeleton className="h-56 w-full" />
                ) : trendQuery.isError ? (
                  <p className="text-sm text-destructive">Couldn&apos;t load the projection.</p>
                ) : (
                  <LineChart data={projectionData} series={projectionSeries} formatter={projectionFormatter} />
                )}
              </CardContent>
            </Card>
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
                  <PipelineFunnelChart stages={funnelQuery.data.stages} pipelineName={funnelQuery.data.pipelineName} pipelineId={funnelQuery.data.pipelineId} />
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline value by department</CardTitle>
                <CardDescription>Open pipeline value, share by department.</CardDescription>
              </CardHeader>
              <CardContent>
                {kpisQuery.isLoading ? (
                  <Skeleton className="h-56 w-full" />
                ) : byDepartmentDonutData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No opportunities assigned to an owner with a department yet.</p>
                ) : (
                  <PieChart donut data={byDepartmentDonutData} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deal loss reasons</CardTitle>
                <CardDescription>All-time, top 5 reasons plus everything else.</CardDescription>
              </CardHeader>
              <CardContent>
                {kpisQuery.isLoading ? (
                  <Skeleton className="h-56 w-full" />
                ) : lossReasonDonutData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No lost opportunities recorded yet.</p>
                ) : (
                  <PieChart donut data={lossReasonDonutData} />
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
              <CardTitle>Renewal forecast</CardTitle>
              <CardDescription>Weighted renewal premium due in the current period, by status, owner, or line of business.</CardDescription>
            </CardHeader>
            <CardContent>
              <RenewalForecastPanel />
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

        <div id="custom-dashboard-section">
          <CustomDashboardSection />
        </div>
      </div>
    </div>
  );
}
