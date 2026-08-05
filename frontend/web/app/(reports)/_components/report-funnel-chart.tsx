'use client';

import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@topiadesk/ui';
import { formatReportValue } from '../_lib/format';
import { BRAND_ORDINAL_RAMP, type ChartableShape } from '../_lib/chart';
import type { ReportResult } from '../_lib/types';

/**
 * True funnel — same one-dimension/one-measure shape as ReportBarChart (see
 * chart.ts's getChartableShape), but rows are sorted descending by value
 * and rendered as centered, narrowing bars (rather than a left-aligned
 * list) so it reads as an actual funnel, not a re-skinned bar chart. Each
 * stage also gets a "% of first stage" conversion readout underneath,
 * since that's the entire point of a funnel visualization and the data
 * already supports it (no extra fetch — just arithmetic against the
 * largest value in the same result). Sales Pipeline Conversion & Velocity
 * and Renewal Pipeline by Carrier are the two current `funnel`-typed
 * reports; both are naturally "biggest stage first" once sorted, even
 * though pivotByDimension's Map-insertion order doesn't guarantee that
 * server-side.
 *
 * Per the dataviz skill: single series, so no legend; brand ramp light->
 * dark by funnel depth (mirrors app/(dashboard)/pipeline-funnel-chart.tsx's
 * "further along reads as darker" convention); direct labels always
 * visible; a per-stage Tooltip for the other measures.
 */
export function ReportFunnelChart({ result, shape }: { result: ReportResult; shape: ChartableShape }) {
  const { dimensionColumn, measureColumn } = shape;

  const stages = [...result.rows]
    .map((row) => ({ row, value: Number(row[measureColumn.key] ?? 0) }))
    .sort((a, b) => b.value - a.value);

  const maxValue = Math.max(1, ...stages.map((s) => s.value));
  const firstStageLabel = stages[0] ? String(stages[0].row[dimensionColumn.key] ?? 'first stage') : 'first stage';

  return (
    <div className="mx-auto max-w-xl space-y-3" aria-label={`${measureColumn.label} funnel by ${dimensionColumn.label}`}>
      {stages.map(({ row, value }, i) => {
        const widthPercent = Math.max(6, Math.round((value / maxValue) * 100));
        const conversionPercent = maxValue > 0 ? Math.round((value / maxValue) * 1000) / 10 : 0;
        const label = String(row[dimensionColumn.key] ?? 'Unknown');
        const rampIndex = stages.length <= 1 ? BRAND_ORDINAL_RAMP.length - 1 : Math.round((i / (stages.length - 1)) * (BRAND_ORDINAL_RAMP.length - 1));
        const colorClass = BRAND_ORDINAL_RAMP[rampIndex] ?? 'bg-brand-500';

        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{label}</span>
              {i > 0 ? <span>{conversionPercent}% of {firstStageLabel}</span> : null}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  role="img"
                  aria-label={`${label}: ${formatReportValue(measureColumn.format, value)}, ${conversionPercent}% of the top stage`}
                  className="mx-auto flex h-9 items-center justify-center focus:outline-none focus:ring-2 focus:ring-ring"
                  style={{ width: `${widthPercent}%` }}
                >
                  <div className={cn('h-full w-full rounded-[4px]', colorClass)} />
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
            <p className="text-center text-xs tabular-nums text-muted-foreground">{formatReportValue(measureColumn.format, value)}</p>
          </div>
        );
      })}
    </div>
  );
}
