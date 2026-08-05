'use client';

import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@topiadesk/ui';
import { formatReportValue } from '../_lib/format';
import type { StackedBarShape } from '../_lib/chart';
import type { ReportResult } from '../_lib/types';

/** Alternates the brand and gold ramps rather than inventing new hues —
 * see chart.ts's BRAND_ORDINAL_RAMP comment for why this design system has
 * no general-purpose multi-hue categorical palette to draw from. Capped at
 * 4 real series (the dataviz skill's series-count ladder: "4 -> direct
 * labels become mandatory... cap at three/four, fold the tail into
 * Other") plus a 5th "Other" bucket in a neutral tone so it never competes
 * with a real series for identity. */
const SERIES_COLORS = ['bg-brand-600', 'bg-gold-500', 'bg-brand-300', 'bg-gold-300'];
const OTHER_COLOR = 'bg-muted-foreground/30';
const MAX_SERIES = SERIES_COLORS.length;
const MAX_CATEGORIES = 8;
const OTHER_LABEL = 'Other';

/**
 * Stacked bar for a report whose unpivoted rows carry two independent
 * dimension columns (see chart.ts's getStackedBarShape) — e.g. Premium
 * Aging by Branch: branch (category) x agingBucket (stacked segment) x
 * outstandingAmount. Rows are re-aggregated here (sum per category+series
 * pair) since the raw grain can be finer than the two columns being
 * charted (other declared dimensions collapse into the sum). Categories
 * and series are each capped and the overflow folded into "Other" per the
 * dataviz skill, rather than rendering an unreadable wall of bars/legend
 * entries.
 *
 * Bar length is normalized against the largest category TOTAL (not always
 * 100%), so magnitude is comparable across categories — the same
 * convention app/(policy)/premiums/aging-chart.tsx uses. A legend is
 * always shown (2+ series never rely on color alone, per the skill); each
 * bar's Tooltip itemizes every segment's exact value, mirroring
 * ReportBarChart's per-row breakdown tooltip.
 */
export function ReportStackedBarChart({ result, shape }: { result: ReportResult; shape: StackedBarShape }) {
  const { categoryColumn, seriesColumn, measureColumn } = shape;

  // 1. Sum measure per (category, series) pair.
  const totalsByCategory = new Map<string, Map<string, number>>();
  const totalByCategory = new Map<string, number>();
  const totalBySeries = new Map<string, number>();
  for (const row of result.rows) {
    const category = String(row[categoryColumn.key] ?? 'Unknown');
    const series = String(row[seriesColumn.key] ?? 'Unknown');
    const value = Number(row[measureColumn.key] ?? 0);
    const seriesMap = totalsByCategory.get(category) ?? new Map<string, number>();
    seriesMap.set(series, (seriesMap.get(series) ?? 0) + value);
    totalsByCategory.set(category, seriesMap);
    totalByCategory.set(category, (totalByCategory.get(category) ?? 0) + value);
    totalBySeries.set(series, (totalBySeries.get(series) ?? 0) + value);
  }

  // 2. Cap categories to the top N by total.
  const topCategories = [...totalByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CATEGORIES)
    .map(([category]) => category);

  // 3. Cap series to the top (MAX_SERIES - 1) by total, folding the rest into "Other".
  const rankedSeries = [...totalBySeries.entries()].sort((a, b) => b[1] - a[1]).map(([series]) => series);
  const keptSeries = rankedSeries.slice(0, MAX_SERIES - 1);
  const hasOverflow = rankedSeries.length > keptSeries.length;
  const legendSeries = hasOverflow ? [...keptSeries, OTHER_LABEL] : keptSeries;
  const colorBySeries = new Map<string, string>(legendSeries.map((series, i) => [series, series === OTHER_LABEL ? OTHER_COLOR : (SERIES_COLORS[i] ?? OTHER_COLOR)]));

  const maxCategoryTotal = Math.max(1, ...topCategories.map((c) => totalByCategory.get(c) ?? 0));

  if (topCategories.length === 0) return null;

  return (
    <div className="space-y-4" aria-label={`${measureColumn.label} by ${categoryColumn.label}, stacked by ${seriesColumn.label}`}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legend">
        {legendSeries.map((series) => (
          <li key={series} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', colorBySeries.get(series))} aria-hidden />
            {series}
          </li>
        ))}
      </ul>

      <ul className="space-y-2.5">
        {topCategories.map((category) => {
          const seriesMap = totalsByCategory.get(category) ?? new Map<string, number>();
          const categoryTotal = totalByCategory.get(category) ?? 0;
          const trackWidthPercent = Math.max(4, Math.round((categoryTotal / maxCategoryTotal) * 100));

          const segments = keptSeries.map((series) => ({ series, value: seriesMap.get(series) ?? 0 }));
          const otherValue = hasOverflow ? [...seriesMap.entries()].filter(([series]) => !keptSeries.includes(series)).reduce((sum, [, v]) => sum + v, 0) : 0;
          if (hasOverflow) segments.push({ series: OTHER_LABEL, value: otherValue });

          return (
            <li key={category} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3">
              <span className="truncate text-sm font-medium text-foreground" title={category}>
                {category}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    role="img"
                    aria-label={`${category}: ${formatReportValue(measureColumn.format, categoryTotal)} total`}
                    className="flex h-6 overflow-hidden rounded-sm bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                    style={{ width: `${trackWidthPercent}%` }}
                  >
                    {(() => {
                      const visibleSegments = segments.filter((s) => s.value > 0);
                      // `border-r` (not a margin) so each segment's box-sizing:border-box
                      // width stays exactly its percentage share — a margin-based gap would
                      // push the total past 100% of the track and get clipped by
                      // overflow-hidden. The border color matches the track's own bg-muted,
                      // so it reads as a surface-color seam (the mark spec's "surface gap"),
                      // not a stroke drawn around the mark.
                      return visibleSegments.map((s, i) => (
                        <div
                          key={s.series}
                          className={cn(
                            'box-border h-full',
                            colorBySeries.get(s.series),
                            i === visibleSegments.length - 1 && 'rounded-r-[4px]',
                            i < visibleSegments.length - 1 && 'border-r-2 border-muted',
                          )}
                          style={{ width: `${categoryTotal > 0 ? (s.value / categoryTotal) * 100 : 0}%` }}
                        />
                      ));
                    })()}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-0.5">
                    <p className="font-medium text-popover-foreground">{category}</p>
                    {segments.map((s) => (
                      <p key={s.series}>
                        {s.series}: <span className="font-semibold">{formatReportValue(measureColumn.format, s.value)}</span>
                      </p>
                    ))}
                    <p className="pt-0.5 text-popover-foreground">
                      Total: <span className="font-semibold">{formatReportValue(measureColumn.format, categoryTotal)}</span>
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
              <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                {formatReportValue(measureColumn.format, categoryTotal)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
