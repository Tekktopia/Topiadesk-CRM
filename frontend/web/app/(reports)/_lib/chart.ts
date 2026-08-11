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

export interface KpiShape extends ChartableShape {
  /** Full ordered series (by dimension's raw string sort — same "YYYY-MM sorts chronologically" convention getChartableShape's line-chart consumers rely on), for the sparkline + period-over-period delta. */
  series: Array<{ label: string; value: number }>;
}

/**
 * A KPI card needs the same one-dimension/one-measure shape as bar/line/
 * funnel (getChartableShape) — it's a *display* difference (headline
 * number + sparkline instead of a full chart), not a different data
 * requirement, so this reuses that detector rather than inventing a
 * parallel one.
 */
export function getKpiShape(result: ReportResult): KpiShape | null {
  const base = getChartableShape(result);
  if (!base) return null;
  const sortedRows = [...result.rows].sort((a, b) => String(a[base.dimensionColumn.key] ?? '').localeCompare(String(b[base.dimensionColumn.key] ?? '')));
  const series = sortedRows.map((row) => ({
    label: String(row[base.dimensionColumn.key] ?? 'Unknown'),
    value: Number(row[base.measureColumn.key] ?? 0),
  }));
  return { ...base, series };
}

export interface ComboShape {
  dimensionColumn: ReportColumn;
  barMeasure: ReportColumn;
  lineMeasure: ReportColumn;
}

/** A combo (dual-axis bar+line) needs one dimension plus *two* independent numeric measures against it — e.g. premium written (bar) vs. loss ratio (line) by month. The first two numeric measures declared on the result become bar/line respectively; reports with only one measure simply aren't combo-chartable (NotChartable fallback). */
export function getComboShape(result: ReportResult): ComboShape | null {
  if (result.rows.length === 0 || result.rows.length > MAX_CHARTABLE_ROWS) return null;
  const dimensionColumns = result.columns.filter((c) => c.format === 'text');
  if (dimensionColumns.length !== 1) return null;
  const measureColumns = result.columns.filter((c) => NUMERIC_FORMATS.has(c.format));
  if (measureColumns.length < 2) return null;
  return { dimensionColumn: dimensionColumns[0]!, barMeasure: measureColumns[0]!, lineMeasure: measureColumns[1]! };
}
