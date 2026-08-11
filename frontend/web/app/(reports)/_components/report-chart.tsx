'use client';

import {
  AreaChart,
  BarChart,
  ComboChart,
  FunnelChart,
  GaugeChart,
  KpiChart,
  LineChart,
  PieChart,
  StackedBarChart,
  TreemapChart,
  type BarChartDatum,
  type FunnelDatum,
  type StackedBarDatum,
} from '@topiadesk/ui';
import { formatReportValue } from '../_lib/format';
import { getChartableShape, getComboShape, getGaugeShape, getKpiShape, getStackedBarShape } from '../_lib/chart';
import type { ReportChartType, ReportResult } from '../_lib/types';

/**
 * Chart-type-aware dispatcher for a report run — picks the mark by the
 * catalog entry's own `defaultChartType` (or a per-widget override, see
 * dashboard-render.util.ts) instead of always rendering the same bar/list
 * regardless of what was declared. `type: 'table'` renders nothing here: a
 * table-typed report's ideal form already *is* the ReportResultTable that
 * report-runner-view.tsx renders unconditionally underneath every result,
 * so stacking a redundant chart on top of it would just repeat the same
 * rows twice.
 *
 * Every mark is a `@topiadesk/ui` Recharts component — this package's own
 * `_lib/chart.ts` stays the sole place that knows how to turn a generic
 * `ReportResult{columns,rows}` into each mark's plain, domain-agnostic
 * prop shape (packages/ui has no idea what a "report" or a "measure
 * format" is, matching how it doesn't know about DataTable's callers
 * either). When a result doesn't fit its declared type's shape (too many
 * rows, missing the right column combination, an empty result), this
 * renders a short explanatory note rather than silently showing nothing or
 * forcing a mismatched chart — the table below always has the real data
 * regardless.
 */
export function ReportChart({ type, result }: { type: ReportChartType; result: ReportResult }) {
  // An empty result already gets its own "No rows matched" message from
  // ReportResultTable below — showing a *second*, chart-shape-specific
  // complaint on top of that would be redundant noise, not new information.
  if (result.rows.length === 0) return null;

  switch (type) {
    case 'bar': {
      const shape = getChartableShape(result);
      return shape ? <BarChart data={toDatums(result, shape.dimensionColumn.key, shape.measureColumn.key)} /> : <NotChartable />;
    }
    case 'line': {
      const shape = getChartableShape(result);
      return shape ? (
        <LineChart data={sortByDimension(toDatums(result, shape.dimensionColumn.key, shape.measureColumn.key), result, shape.dimensionColumn.key)} valueLabel={shape.measureColumn.label} />
      ) : (
        <NotChartable />
      );
    }
    case 'area': {
      const shape = getChartableShape(result);
      return shape ? (
        <AreaChart data={sortByDimension(toDatums(result, shape.dimensionColumn.key, shape.measureColumn.key), result, shape.dimensionColumn.key)} valueLabel={shape.measureColumn.label} />
      ) : (
        <NotChartable />
      );
    }
    case 'pie':
    case 'donut': {
      const shape = getChartableShape(result);
      return shape ? <PieChart data={capToTopCategories(toDatums(result, shape.dimensionColumn.key, shape.measureColumn.key))} donut={type === 'donut'} /> : <NotChartable />;
    }
    case 'funnel': {
      const shape = getChartableShape(result);
      if (!shape) return <NotChartable />;
      const datums = toDatums(result, shape.dimensionColumn.key, shape.measureColumn.key).sort((a, b) => b.value - a.value);
      const maxValue = Math.max(1, ...datums.map((d) => d.value));
      const funnelData: FunnelDatum[] = datums.map((d, i) => ({
        ...d,
        conversionLabel: i === 0 ? undefined : `${Math.round((d.value / maxValue) * 1000) / 10}% of ${datums[0]!.name}`,
      }));
      return <FunnelChart data={funnelData} />;
    }
    case 'treemap': {
      const shape = getChartableShape(result);
      return shape ? <TreemapChart data={toDatums(result, shape.dimensionColumn.key, shape.measureColumn.key)} /> : <NotChartable />;
    }
    case 'stackedBar': {
      const shape = getStackedBarShape(result);
      if (!shape) return <NotChartable />;
      const { data, seriesKeys } = toStackedDatums(result, shape.categoryColumn.key, shape.seriesColumn.key, shape.measureColumn.key);
      return <StackedBarChart data={data} seriesKeys={seriesKeys} />;
    }
    case 'gauge': {
      const shape = getGaugeShape(result);
      return shape ? <GaugeChart label={shape.measureColumn.label} valuePercent={shape.valuePercent} sampleSize={shape.sampleSize} /> : <NotChartable />;
    }
    case 'kpi': {
      const shape = getKpiShape(result);
      if (!shape) return <NotChartable />;
      const last = shape.series[shape.series.length - 1];
      return (
        <KpiChart
          label={shape.measureColumn.label}
          formattedValue={formatReportValue(shape.measureColumn.format, last?.value ?? null)}
          trend={shape.series.map((s) => ({ name: s.label, value: s.value }))}
        />
      );
    }
    case 'combo': {
      const shape = getComboShape(result);
      if (!shape) return <NotChartable />;
      const data = result.rows.map((row) => ({
        name: String(row[shape.dimensionColumn.key] ?? 'Unknown'),
        bar: Number(row[shape.barMeasure.key] ?? 0),
        line: Number(row[shape.lineMeasure.key] ?? 0),
      }));
      return <ComboChart data={data} barLabel={shape.barMeasure.label} lineLabel={shape.lineMeasure.label} />;
    }
    case 'table':
      return null;
    default:
      return null;
  }
}

function toDatums(result: ReportResult, dimensionKey: string, measureKey: string): BarChartDatum[] {
  const measureColumn = result.columns.find((c) => c.key === measureKey)!;
  return result.rows.map((row) => ({
    name: String(row[dimensionKey] ?? 'Unknown'),
    value: Number(row[measureKey] ?? 0),
    formattedValue: formatReportValue(measureColumn.format, row[measureKey] ?? null),
  }));
}

/** Caps a pie/donut's slices to the top N by value, folding the rest into a single "Other" slice — PieChart no longer has a legend fallback for large slice counts (chart-theme.ts's categoricalColor only has 4 cycling hues), so the cap has to happen here instead. Same "top-N + Other" shape toStackedDatums below already uses for stacked bars. */
function capToTopCategories(datums: BarChartDatum[], max = 5): BarChartDatum[] {
  if (datums.length <= max) return datums;
  const sorted = [...datums].sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, max);
  const otherValue = sorted.slice(max).reduce((sum, d) => sum + d.value, 0);
  return [...kept, { name: 'Other', value: otherValue, formattedValue: undefined }];
}

/** Same "dimension's raw string value sorts chronologically for every current line/area report" convention the retired hand-rolled line chart relied on (YYYY-MM sorts lexicographically the same as chronologically). */
function sortByDimension(datums: BarChartDatum[], result: ReportResult, dimensionKey: string): BarChartDatum[] {
  const order = new Map(result.rows.map((row, i) => [String(row[dimensionKey] ?? 'Unknown'), i]));
  return [...datums].sort((a, b) => a.name.localeCompare(b.name) || (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
}

/**
 * Pivots unpivoted rows into one row per category with one numeric key per
 * series — same aggregate/cap/"Other"-fold logic the retired hand-rolled
 * stacked bar used (top 8 categories by total, top 3 series by total plus
 * an "Other" bucket for the rest), just producing Recharts' expected
 * pivoted shape instead of rendering directly.
 */
function toStackedDatums(
  result: ReportResult,
  categoryKey: string,
  seriesKey: string,
  measureKey: string,
): { data: StackedBarDatum[]; seriesKeys: string[] } {
  const MAX_CATEGORIES = 8;
  const MAX_SERIES = 4;
  const OTHER = 'Other';

  const totalsByCategory = new Map<string, Map<string, number>>();
  const totalByCategory = new Map<string, number>();
  const totalBySeries = new Map<string, number>();
  for (const row of result.rows) {
    const category = String(row[categoryKey] ?? 'Unknown');
    const series = String(row[seriesKey] ?? 'Unknown');
    const value = Number(row[measureKey] ?? 0);
    const seriesMap = totalsByCategory.get(category) ?? new Map<string, number>();
    seriesMap.set(series, (seriesMap.get(series) ?? 0) + value);
    totalsByCategory.set(category, seriesMap);
    totalByCategory.set(category, (totalByCategory.get(category) ?? 0) + value);
    totalBySeries.set(series, (totalBySeries.get(series) ?? 0) + value);
  }

  const topCategories = [...totalByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CATEGORIES)
    .map(([category]) => category);

  const rankedSeries = [...totalBySeries.entries()].sort((a, b) => b[1] - a[1]).map(([series]) => series);
  const keptSeries = rankedSeries.slice(0, MAX_SERIES - 1);
  const hasOverflow = rankedSeries.length > keptSeries.length;
  const seriesKeys = hasOverflow ? [...keptSeries, OTHER] : keptSeries;

  const data: StackedBarDatum[] = topCategories.map((category) => {
    const seriesMap = totalsByCategory.get(category) ?? new Map<string, number>();
    const row: StackedBarDatum = { category };
    for (const series of keptSeries) row[series] = seriesMap.get(series) ?? 0;
    if (hasOverflow) {
      row[OTHER] = [...seriesMap.entries()].filter(([series]) => !keptSeries.includes(series)).reduce((sum, [, v]) => sum + v, 0);
    }
    return row;
  });

  return { data, seriesKeys };
}

function NotChartable() {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      This result doesn&apos;t fit a chart view for its current shape — see the table below.
    </p>
  );
}
