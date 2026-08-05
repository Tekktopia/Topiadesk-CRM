'use client';

import { getChartableShape, getGaugeShape, getStackedBarShape } from '../_lib/chart';
import { ReportBarChart } from './report-bar-chart';
import { ReportFunnelChart } from './report-funnel-chart';
import { ReportGaugeChart } from './report-gauge-chart';
import { ReportLineChart } from './report-line-chart';
import { ReportStackedBarChart } from './report-stacked-bar-chart';
import { ReportTreemapChart } from './report-treemap-chart';
import type { ReportChartType, ReportResult } from '../_lib/types';

/**
 * Chart-type-aware dispatcher for a report run — picks the mark by the
 * catalog entry's own `defaultChartType` instead of always rendering the
 * same bar/list regardless of what was declared (the bug this component
 * exists to fix). `type: 'table'` renders nothing here: a table-typed
 * report's ideal form already *is* the ReportResultTable that
 * report-runner-view.tsx renders unconditionally underneath every result
 * (per that component's own doc comment — "the table is the source of
 * truth"), so stacking a redundant chart on top of it would just repeat
 * the same rows twice.
 *
 * Every other type has its own shape-detector in `_lib/chart.ts` (the
 * bar/line/funnel/treemap family all share `getChartableShape` — one
 * dimension + one measure, ≤30 rows — since only the mark differs between
 * them; stackedBar and gauge each need their own). When a result doesn't
 * fit its declared type's shape (too many rows, missing the right column
 * combination, an empty result), this renders a short explanatory note
 * rather than silently showing nothing or forcing a mismatched chart —
 * the table below always has the real data regardless.
 */
export function ReportChart({ type, result }: { type: ReportChartType; result: ReportResult }) {
  // An empty result already gets its own "No rows matched" message from
  // ReportResultTable below — showing a *second*, chart-shape-specific
  // complaint on top of that would be redundant noise, not new information.
  if (result.rows.length === 0) return null;

  switch (type) {
    case 'bar': {
      const shape = getChartableShape(result);
      return shape ? <ReportBarChart result={result} shape={shape} /> : <NotChartable />;
    }
    case 'line': {
      const shape = getChartableShape(result);
      return shape ? <ReportLineChart result={result} shape={shape} /> : <NotChartable />;
    }
    case 'funnel': {
      const shape = getChartableShape(result);
      return shape ? <ReportFunnelChart result={result} shape={shape} /> : <NotChartable />;
    }
    case 'treemap': {
      const shape = getChartableShape(result);
      return shape ? <ReportTreemapChart result={result} shape={shape} /> : <NotChartable />;
    }
    case 'stackedBar': {
      const shape = getStackedBarShape(result);
      return shape ? <ReportStackedBarChart result={result} shape={shape} /> : <NotChartable />;
    }
    case 'gauge': {
      const shape = getGaugeShape(result);
      return shape ? <ReportGaugeChart shape={shape} /> : <NotChartable />;
    }
    case 'table':
      return null;
    default:
      return null;
  }
}

function NotChartable() {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      This result doesn&apos;t fit a chart view for its current shape — see the table below.
    </p>
  );
}
