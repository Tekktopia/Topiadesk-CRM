import type { ReportColumn, ReportResult } from './types';

export const NUMERIC_FORMATS = new Set(['currency', 'number', 'percent', 'days']);
const MAX_CHARTABLE_ROWS = 30;

/**
 * Ordinal brand ramp, light->dark by position — the same fixed-order
 * progression convention app/(dashboard)/pipeline-funnel-chart.tsx and
 * app/(knowledge)/knowledge/surveys/[id]/score-distribution-chart.tsx
 * already use for "this bar/segment is further along an ordered sequence"
 * (stage order, score value, rank). Reused here rather than invented anew:
 * this design system has exactly one brand hue plus a reserved gold accent
 * (see packages/ui/src/tokens.ts's header comment — gold is "reserved for
 * premium/priority/attention signal", not a general-purpose 2nd categorical
 * hue), so a genuine multi-hue categorical palette doesn't exist to draw
 * from. Charts below that need >1 visually distinct series (stacked bar,
 * treemap) alternate this ramp with the gold ramp instead of fabricating
 * new hues.
 */
export const BRAND_ORDINAL_RAMP = ['bg-brand-300', 'bg-brand-400', 'bg-brand-500', 'bg-brand-600', 'bg-brand-700', 'bg-brand-800'];

export interface ChartableShape {
  dimensionColumn: ReportColumn;
  measureColumn: ReportColumn;
}

/**
 * A report result is "naturally chartable" (per the build brief: one
 * dimension + one numeric measure) when it has exactly one dimension column
 * — every report's `reportColumns()` helper (packages/reports/src/
 * report-definition.ts) hardcodes dimension columns to `format: 'text'`, so
 * that's the reliable signal a pivot (via DimensionSelect) was applied —
 * plus at least one numeric measure, and a small enough row count to read
 * as a bar chart rather than a wall of bars. The first numeric measure
 * column is used as the plotted value; the table below always shows every
 * measure regardless.
 *
 * Shared by every single-series chart type (bar, line, funnel, treemap) —
 * the data shape they each need is identical; only the mark differs.
 */
export function getChartableShape(result: ReportResult): ChartableShape | null {
  if (result.rows.length === 0 || result.rows.length > MAX_CHARTABLE_ROWS) return null;
  const dimensionColumns = result.columns.filter((c) => c.format === 'text');
  if (dimensionColumns.length !== 1) return null;
  const measureColumn = result.columns.find((c) => NUMERIC_FORMATS.has(c.format));
  if (!measureColumn) return null;
  return { dimensionColumn: dimensionColumns[0]!, measureColumn };
}

export interface StackedBarShape {
  /** x-axis category — the first declared dimension column. */
  categoryColumn: ReportColumn;
  /** the stacked segment identity — the last declared dimension column. */
  seriesColumn: ReportColumn;
  measureColumn: ReportColumn;
}

/**
 * A stacked bar needs two independent text columns (category + the thing
 * being stacked) plus a numeric measure — only present when no single
 * `dimension` pivot was applied (DimensionSelect's "No grouping" / finest
 * detail), since picking one dimension collapses `reportColumns()` down to
 * a single text column (see getChartableShape's comment) and there's
 * nothing left to stack by. E.g. Premium Aging by Branch's unpivoted rows
 * carry branch/carrier/lineOfBusiness/agingBucket all at once; this uses
 * the first declared dimension (branch) as the category and the last
 * (agingBucket — the finest-grained, most "stackable" breakdown in every
 * current report definition) as the series. Best-effort by construction:
 * this module has no way to know which of N dimension columns is
 * semantically "the stack key," so it takes the one convention every
 * report definition in packages/reports/src/definitions/ happens to
 * follow (declare the stack-worthy dimension last).
 */
export function getStackedBarShape(result: ReportResult): StackedBarShape | null {
  if (result.rows.length === 0) return null;
  const textColumns = result.columns.filter((c) => c.format === 'text');
  if (textColumns.length < 2) return null;
  const measureColumn = result.columns.find((c) => NUMERIC_FORMATS.has(c.format));
  if (!measureColumn) return null;
  return { categoryColumn: textColumns[0]!, seriesColumn: textColumns[textColumns.length - 1]!, measureColumn };
}

export interface GaugeShape {
  measureColumn: ReportColumn;
  /** 0-100, already clamped. */
  valuePercent: number;
  sampleSize: number;
}

/**
 * A gauge is a "single ratio against a limit" (per the dataviz skill's
 * choosing-a-form.md Meter row) — it needs exactly one percent-format
 * measure to read as the ratio. Every current `gauge`-typed report
 * (document-compliance-readiness) carries a `*Percent` measure that is
 * already 0/100 per finest-grain row, so a straight mean across whatever
 * rows came back (the full result if unpivoted, or one bucket's worth if a
 * dimension was selected) is a faithful "share of X" headline number, not
 * just an approximation for a lack of anything better.
 */
export function getGaugeShape(result: ReportResult): GaugeShape | null {
  if (result.rows.length === 0) return null;
  const measureColumn = result.columns.find((c) => c.format === 'percent');
  if (!measureColumn) return null;
  const values = result.rows.map((row) => Number(row[measureColumn.key] ?? NaN)).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { measureColumn, valuePercent: Math.min(100, Math.max(0, avg)), sampleSize: values.length };
}

// ---------------------------------------------------------------------------
// Treemap layout
// ---------------------------------------------------------------------------

export interface TreemapTile {
  label: string;
  value: number;
  /** All four in percent (0-100) of the container, ready for CSS `left/top/width/height`. */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

interface TreemapAreaItem {
  label: string;
  value: number;
  area: number;
}

function treemapRowWorstRatio(row: TreemapAreaItem[], bandLength: number): number {
  const sum = row.reduce((s, item) => s + item.area, 0);
  if (sum === 0 || bandLength === 0) return Infinity;
  const bandThickness = sum / bandLength;
  let worst = 0;
  for (const item of row) {
    if (item.area <= 0) continue;
    const ratio = Math.max((bandThickness * bandThickness) / item.area, item.area / (bandThickness * bandThickness));
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

/**
 * Classic Bruls/Huizing/van Wijk "squarified" treemap: lay out rows across
 * whichever side of the remaining rectangle is currently shorter, growing
 * each row while doing so doesn't worsen its worst aspect ratio, so tiles
 * stay close to square instead of degenerating into slivers (a plain
 * single-axis "slice" layout). Operates in a normalized `W x H` box (area
 * `W*H === 10000`, i.e. percentage-of-container units) sized to
 * `aspectRatio`, so callers can place tiles with plain CSS percentages —
 * no pixel measurement or ResizeObserver needed. Verified against a
 * standalone harness (total tile area sums to 10000, no negative/
 * out-of-bounds rects, single-item and equal-weight cases layout exactly
 * as expected) before wiring into report-treemap-chart.tsx.
 */
export function computeTreemapLayout(items: Array<{ label: string; value: number }>, aspectRatio = 2): TreemapTile[] {
  const positive = items.filter((item) => item.value > 0);
  if (positive.length === 0) return [];
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  const H = Math.sqrt(10000 / aspectRatio);
  const W = 10000 / H;
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  let remaining: TreemapAreaItem[] = sorted.map((item) => ({ ...item, area: (item.value / total) * (W * H) }));

  const tiles: TreemapTile[] = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;

  while (remaining.length > 0) {
    const bandLength = Math.min(w, h);
    let row: TreemapAreaItem[] = [remaining[0]!];
    let consumed = 1;
    while (consumed < remaining.length) {
      const candidate = [...row, remaining[consumed]!];
      if (treemapRowWorstRatio(candidate, bandLength) <= treemapRowWorstRatio(row, bandLength)) {
        row = candidate;
        consumed += 1;
      } else {
        break;
      }
    }
    remaining = remaining.slice(consumed);

    const rowSum = row.reduce((sum, item) => sum + item.area, 0);
    const bandThickness = bandLength > 0 ? rowSum / bandLength : 0;

    if (w <= h) {
      // Shorter side is the width — lay a horizontal band across the top, full width, `bandThickness` tall.
      let offsetX = x;
      for (const item of row) {
        const itemWidth = bandThickness > 0 ? item.area / bandThickness : 0;
        tiles.push({
          label: item.label,
          value: item.value,
          xPct: (offsetX / W) * 100,
          yPct: (y / H) * 100,
          wPct: (itemWidth / W) * 100,
          hPct: (bandThickness / H) * 100,
        });
        offsetX += itemWidth;
      }
      y += bandThickness;
      h -= bandThickness;
    } else {
      // Shorter side is the height — lay a vertical band down the left, full height, `bandThickness` wide.
      let offsetY = y;
      for (const item of row) {
        const itemHeight = bandThickness > 0 ? item.area / bandThickness : 0;
        tiles.push({
          label: item.label,
          value: item.value,
          xPct: (x / W) * 100,
          yPct: (offsetY / H) * 100,
          wPct: (bandThickness / W) * 100,
          hPct: (itemHeight / H) * 100,
        });
        offsetY += itemHeight;
      }
      x += bandThickness;
      w -= bandThickness;
    }
  }

  return tiles;
}
