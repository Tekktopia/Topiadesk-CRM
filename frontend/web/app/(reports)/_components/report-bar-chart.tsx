'use client';

import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@topiadesk/ui';
import { formatReportValue } from '../_lib/format';
import type { ChartableShape } from '../_lib/chart';
import type { ReportResult } from '../_lib/types';

/**
 * Generic horizontal bar list for a chartable report result — same
 * conventions as app/(dashboard)/pipeline-funnel-chart.tsx (built per the
 * dataviz skill): direct labels (name + formatted value, always visible),
 * a per-bar Tooltip for the other measures, bars square at the baseline and
 * 4px-rounded at the data end. Unlike that dashboard chart, there's no
 * won/lost status semantic here — an arbitrary report's dimension values
 * have no fixed meaning — so this uses a single ordinal brand color rather
 * than a status ramp.
 */
export function ReportBarChart({ result, shape }: { result: ReportResult; shape: ChartableShape }) {
  const { dimensionColumn, measureColumn } = shape;
  const values = result.rows.map((row) => Number(row[measureColumn.key] ?? 0));
  const maxValue = Math.max(1, ...values.map((v) => Math.abs(v)));

  return (
    <ul className="space-y-2.5" aria-label={`${measureColumn.label} by ${dimensionColumn.label}`}>
      {result.rows.map((row, i) => {
        const value = values[i] ?? 0;
        const widthPercent = Math.max(2, Math.round((Math.abs(value) / maxValue) * 100));
        const label = String(row[dimensionColumn.key] ?? 'Unknown');
        return (
          <li key={i} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3">
            <span className="truncate text-sm font-medium text-foreground" title={label}>
              {label}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  role="img"
                  aria-label={`${label}: ${formatReportValue(measureColumn.format, value)}`}
                  className="h-6 w-full overflow-hidden rounded-sm bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div
                    className={cn('h-full rounded-r-[4px] bg-primary transition-[width]')}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="space-y-0.5">
                  <p className="font-medium text-popover-foreground">{label}</p>
                  {result.columns
                    .filter((c) => c.key !== dimensionColumn.key)
                    .map((c) => (
                      <p key={c.key}>
                        {c.label}: <span className="font-semibold">{formatReportValue(c.format, row[c.key] ?? null)}</span>
                      </p>
                    ))}
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
              {formatReportValue(measureColumn.format, value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
