'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@topiadesk/ui';
import { formatReportValue } from '../_lib/format';
import type { ChartableShape } from '../_lib/chart';
import type { ReportResult } from '../_lib/types';

/**
 * Trend line for a chartable report result (same one-dimension/one-measure
 * shape as ReportBarChart — see chart.ts's getChartableShape) — used for
 * `defaultChartType: 'line'` reports, which are always time-trended
 * (policy-lapse-rate's `expiryMonth`, complaint-case-volume-trends'
 * `month`). Rows are sorted ascending by the dimension's raw string value,
 * which reads chronologically for every current line report (`YYYY-MM`
 * sorts lexicographically the same as chronologically) without needing a
 * real date parse — a report whose dimension isn't date-like still gets a
 * stable, readable ordering (alphabetical) rather than the arbitrary order
 * the backend happened to return.
 *
 * Built per the dataviz skill: single series (no legend needed — the card
 * title names it), a 2px line with an 8px end marker, hairline hidden
 * gridlines, a direct label at the line's end (marks-and-anatomy.md:
 * "Lines -> value at the end"), and a per-point hover Tooltip (the
 * interactive layer a line chart ships by default). The SVG viewBox is a
 * fixed 0-100 coordinate space with `vectorEffect="non-scaling-stroke"` on
 * every stroked element so line/gridline thickness stays a true fixed
 * width regardless of the container's stretched (non-square) aspect ratio.
 * Point markers are plain HTML circles (not SVG `<circle>`) laid on top via
 * percentage `left/top` for the same reason: `vector-effect` only protects
 * stroke width, not fill geometry, so an SVG circle drawn in this
 * non-uniformly-stretched viewBox would render as an ellipse.
 */
export function ReportLineChart({ result, shape }: { result: ReportResult; shape: ChartableShape }) {
  const { dimensionColumn, measureColumn } = shape;

  const sortedRows = [...result.rows].sort((a, b) => {
    const aLabel = String(a[dimensionColumn.key] ?? '');
    const bLabel = String(b[dimensionColumn.key] ?? '');
    return aLabel.localeCompare(bLabel);
  });

  const values = sortedRows.map((row) => Number(row[measureColumn.key] ?? 0));
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const valueRange = maxValue - minValue || 1;

  // Points live in a [4, 96] x band and a [12, 88] y band (SVG y-down, so
  // higher values map to a smaller y) — the margin keeps end markers and
  // the end-label off the viewBox edge.
  const points = sortedRows.map((row, i) => {
    const value = values[i] ?? 0;
    const xPct = sortedRows.length <= 1 ? 50 : 4 + (i / (sortedRows.length - 1)) * 92;
    const yPct = 88 - ((value - minValue) / valueRange) * 76;
    return { xPct, yPct, value, label: String(row[dimensionColumn.key] ?? 'Unknown') };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct} ${p.yPct}`).join(' ');
  const gridYs = [12, 31, 50, 69, 88];
  const lastPoint = points[points.length - 1];

  if (points.length === 0) return null;

  return (
    <div className="space-y-2" aria-label={`${measureColumn.label} by ${dimensionColumn.label}, trended`}>
      <div className="relative h-56 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-hidden>
          {gridYs.map((gy) => (
            <line key={gy} x1={0} y1={gy} x2={100} y2={gy} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {points.length > 1 ? (
            <path d={linePath} fill="none" className="stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
        </svg>

        {lastPoint ? (
          <span
            className="pointer-events-none absolute whitespace-nowrap text-xs font-semibold tabular-nums text-foreground"
            style={{ left: `${lastPoint.xPct}%`, top: `${lastPoint.yPct}%`, transform: 'translate(-50%, -14px)' }}
          >
            {formatReportValue(measureColumn.format, lastPoint.value)}
          </span>
        ) : null}

        {points.map((p, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              {/* A plain HTML circle (not SVG) — h-4/w-4 is the hit target
                  (interaction.md: "hit targets bigger than the mark"); the
                  visible 8px marker is the inner span, ringed in the card
                  surface color per the marker's "surface ring" spec. */}
              <button
                type="button"
                tabIndex={0}
                aria-label={`${p.label}: ${formatReportValue(measureColumn.format, p.value)}`}
                className="absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
                style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
              >
                <span className="h-2 w-2 rounded-full bg-primary ring-2 ring-card" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium text-popover-foreground">{p.label}</p>
              <p>
                {measureColumn.label}: <span className="font-semibold">{formatReportValue(measureColumn.format, p.value)}</span>
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        {points.length > 2 ? <span>{points[Math.floor((points.length - 1) / 2)]?.label}</span> : null}
        {points.length > 1 ? <span>{points[points.length - 1]?.label}</span> : null}
      </div>
    </div>
  );
}
