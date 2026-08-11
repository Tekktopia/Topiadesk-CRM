'use client';

import * as React from 'react';
import { BarChart, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@topiadesk/ui';
import { formatNaira } from '@/app/(policy)/lib/format';
import { formatReportValue } from '@/app/(reports)/_lib/format';
import { getChartableShape } from '@/app/(reports)/_lib/chart';
import type { ReportResult } from '@/app/(reports)/_lib/types';
import { useRenewalForecast, type DashboardScopeFilters } from './dashboard-hooks';

const GROUP_BY_LABEL: Record<'status' | 'owner' | 'lineOfBusiness', string> = {
  status: 'Status',
  owner: 'Owner',
  lineOfBusiness: 'Line of business',
};

/**
 * Renewal counterpart to SalesForecastPanel — same adapt-to-ReportResult +
 * reuse-BarChart approach, powered by GET
 * /dashboards/operational-kpis/renewal-forecast
 * (DashboardsController.getRenewalForecast). "Weighted" here comes from
 * RENEWAL_STATUS_WEIGHTS (dashboards.controller.ts), not a stored
 * probability field — RenewalSchedule has no equivalent to
 * Opportunity.probability. The "At risk" stat is the literal AT_RISK-status
 * premium total, not inferred from the weight value.
 */
export function RenewalForecastPanel({ filters }: { filters?: DashboardScopeFilters }) {
  const [period, setPeriod] = React.useState<'month' | 'quarter'>('quarter');
  const [groupBy, setGroupBy] = React.useState<'status' | 'owner' | 'lineOfBusiness'>('status');
  const { data, isLoading, isError } = useRenewalForecast(period, groupBy, filters);

  const result: ReportResult | null = data
    ? {
        columns: [
          { key: 'label', label: GROUP_BY_LABEL[groupBy], format: 'text' },
          { key: 'weightedAmount', label: 'Weighted', format: 'currency' },
          { key: 'unweightedAmount', label: 'Unweighted', format: 'currency' },
        ],
        rows: data.groups.map((g) => ({
          label: g.label ?? g.key,
          weightedAmount: Number(g.weightedAmount),
          unweightedAmount: Number(g.unweightedAmount),
        })),
        totalRowCount: data.groups.length,
        generatedAt: new Date().toISOString(),
      }
    : null;
  const shape = result ? getChartableShape(result) : null;
  const chartData =
    result && shape
      ? result.rows.map((row) => ({
          name: String(row[shape.dimensionColumn.key] ?? 'Unknown'),
          value: Number(row[shape.measureColumn.key] ?? 0),
          formattedValue: formatReportValue(shape.measureColumn.format, row[shape.measureColumn.key] ?? null),
        }))
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as 'month' | 'quarter')}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="quarter">This quarter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'status' | 'owner' | 'lineOfBusiness')}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">By status</SelectItem>
              <SelectItem value="owner">By owner</SelectItem>
              <SelectItem value="lineOfBusiness">By line of business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {data ? <span className="text-xs text-muted-foreground">{data.period}</span> : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !data ? (
        <p className="text-sm text-destructive">Couldn&apos;t load the renewal forecast.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-6 border-b border-border pb-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Weighted total</p>
              <p className="text-lg font-semibold text-foreground">{formatNaira(data.totalWeightedAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unweighted total</p>
              <p className="text-lg font-semibold text-foreground">{formatNaira(data.totalUnweightedAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-destructive">At risk</p>
              <p className="text-lg font-semibold text-destructive">{formatNaira(data.atRiskAmount)}</p>
            </div>
          </div>
          {chartData ? (
            <BarChart data={chartData} />
          ) : (
            <p className="text-sm text-muted-foreground">No renewals due in this period.</p>
          )}
        </>
      )}
    </div>
  );
}
