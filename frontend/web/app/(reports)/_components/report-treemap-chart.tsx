'use client';

import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@topiadesk/ui';
import { formatReportValue } from '../_lib/format';
import { BRAND_ORDINAL_RAMP, computeTreemapLayout, type ChartableShape } from '../_lib/chart';
import type { ReportResult } from '../_lib/types';

const MAX_TILES = 20;
/** Ramp steps dark enough that white text reads clearly on them — see
 * packages/ui/src/tokens.ts's brand scale: 500/600/700/800 sit at 40%/32%/
 * 26%/20% HSL lightness, all dark enough for white; 300/400 (72%/56%) need
 * ink instead. Matches marks-and-anatomy.md's "pick white or ink by the
 * fill's luminance" rule for a label set inside a colored fill. */
const DARK_RAMP_INDEX_THRESHOLD = 2;

/**
 * Treemap — part-to-whole by area, for a `defaultChartType: 'treemap'`
 * report's single dimension+measure (chart.ts's getChartableShape; same
 * shape as bar/line/funnel, only the mark differs). Tiles are laid out by
 * computeTreemapLayout's squarified algorithm (verified separately — see
 * that function's doc comment) and capped to the top `MAX_TILES` by value;
 * Account Portfolio Concentration's own `topN` filter is the primary way
 * to keep this readable, this is just a hard backstop.
 *
 * Sequential brand ramp, dark = large (this design system's one
 * "magnitude" hue, same convention as every other ordinal chart in this
 * module — see chart.ts's BRAND_ORDINAL_RAMP comment). Each tile is an
 * absolutely-positioned outer "slot" sized to its exact percentage, with a
 * 2px-inset inner fill — the mark spec's "surface gap" between touching
 * tiles, done via inset instead of a margin/border so adjacent slots can
 * never overflow past 100% (chart.ts's layout already guarantees the
 * slots themselves tile exactly, so only the inner fill needs the inset).
 * A label renders inside a tile only when it's large enough to hold one
 * without crowding (marks-and-anatomy.md: "a label that won't fit doesn't
 * get clipped"); every tile is still focusable and Tooltip-labeled
 * regardless of size.
 */
export function ReportTreemapChart({ result, shape }: { result: ReportResult; shape: ChartableShape }) {
  const { dimensionColumn, measureColumn } = shape;

  const items = result.rows
    .map((row) => ({ label: String(row[dimensionColumn.key] ?? 'Unknown'), value: Number(row[measureColumn.key] ?? 0), row }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_TILES);

  const tiles = computeTreemapLayout(
    items.map((item) => ({ label: item.label, value: item.value })),
    2.2,
  );
  const rowByLabel = new Map(items.map((item) => [item.label, item.row]));

  if (tiles.length === 0) return null;

  return (
    <div
      className="relative h-72 w-full overflow-hidden rounded-md bg-muted"
      aria-label={`${measureColumn.label} by ${dimensionColumn.label}, sized by share of total`}
    >
      {tiles.map((tile, i) => {
        const rampIndex = tiles.length <= 1 ? BRAND_ORDINAL_RAMP.length - 1 : Math.round((1 - i / (tiles.length - 1)) * (BRAND_ORDINAL_RAMP.length - 1));
        const colorClass = BRAND_ORDINAL_RAMP[rampIndex] ?? 'bg-brand-500';
        const isDark = rampIndex >= DARK_RAMP_INDEX_THRESHOLD;
        const row = rowByLabel.get(tile.label);
        const showLabel = tile.wPct >= 14 && tile.hPct >= 16;

        return (
          <Tooltip key={`${tile.label}-${i}`}>
            <TooltipTrigger asChild>
              <div
                className="absolute"
                style={{ left: `${tile.xPct}%`, top: `${tile.yPct}%`, width: `${tile.wPct}%`, height: `${tile.hPct}%` }}
              >
                <div
                  tabIndex={0}
                  role="img"
                  aria-label={`${tile.label}: ${formatReportValue(measureColumn.format, tile.value)}`}
                  className={cn(
                    'absolute inset-0.5 overflow-hidden rounded-[3px] p-1.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                    colorClass,
                  )}
                >
                  {showLabel ? (
                    <div className={cn('flex h-full flex-col justify-end', isDark ? 'text-white' : 'text-brand-950')}>
                      <p className="truncate text-xs font-medium leading-tight">{tile.label}</p>
                      <p className="truncate text-[11px] leading-tight opacity-90">{formatReportValue(measureColumn.format, tile.value)}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="space-y-0.5">
                <p className="font-medium text-popover-foreground">{tile.label}</p>
                {row
                  ? result.columns
                      .filter((c) => c.key !== dimensionColumn.key)
                      .map((c) => (
                        <p key={c.key}>
                          {c.label}: <span className="font-semibold">{formatReportValue(c.format, row[c.key] ?? null)}</span>
                        </p>
                      ))
                  : (
                    <p>
                      {measureColumn.label}: <span className="font-semibold">{formatReportValue(measureColumn.format, tile.value)}</span>
                    </p>
                  )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
