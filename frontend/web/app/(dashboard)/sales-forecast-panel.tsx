'use client';

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@topiadesk/ui';
import { formatNaira } from '@/app/(policy)/lib/format';
import { ReportBarChart } from '@/app/(reports)/_components/report-bar-chart';
import { getChartableShape } from '@/app/(reports)/_lib/chart';
import type { ReportResult } from '@/app/(reports)/_lib/types';
import { useSalesForecast } from './dashboard-hooks';

const GROUP_BY_LABEL: Record<'owner' | 'stage' | 'lineOfBusiness', string> = {
  owner: 'Owner',
  stage: 'Stage',
  lineOfBusiness: 'Line of business',
};

/**
 * Weighted/unweighted pipeline forecast for the current month or quarter —
 * powered by GET /dashboards/operational-kpis/sales-forecast
 * (DashboardsController.getSalesForecast), a fully-built endpoint that had
 * no frontend caller until this panel. Adapts the forecast response into
 * the same ReportResult shape the Reports module's own chart components
 * consume, so ReportBarChart is reused verbatim rather than building a new
 * chart — confirmed the shape (one text dimension + numeric measures)
 * satisfies getChartableShape's requirements.
 */
export function SalesForecastPanel() {
  const [period, setPeriod] = React.useState<'month' | 'quarter'>('quarter');
  const [groupBy, setGroupBy] = React.useState<'owner' | 'stage' | 'lineOfBusiness'>('owner');
  const { data, isLoading, isError } = useSalesForecast(period, groupBy);

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
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'owner' | 'stage' | 'lineOfBusiness')}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">By owner</SelectItem>
              <SelectItem value="stage">By stage</SelectItem>
              <SelectItem value="lineOfBusiness">By line of business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {data ? <span className="text-xs text-muted-foreground">{data.period}</span> : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !data ? (
        <p className="text-sm text-destructive">Couldn&apos;t load the forecast.</p>
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
          </div>
          {result && shape ? (
            <ReportBarChart result={result} shape={shape} />
          ) : (
            <p className="text-sm text-muted-foreground">No open opportunities expected to close in this period.</p>
          )}
        </>
      )}
    </div>
  );
}
