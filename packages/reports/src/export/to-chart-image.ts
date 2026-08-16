import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration, ChartDataset } from 'chart.js';
import type { ReportCellValue, ReportChartType, ReportColumn, ReportResult } from '../report-definition';

/**
 * Renders a real chart image (PNG buffer) from a ReportResult — the one
 * export format `renderReportExport()` (to-csv/to-xlsx/to-pdf) doesn't
 * cover: those three are deliberately table-only (see to-pdf.ts's own
 * comment on why — avoiding a heavy headless-browser dependency). This
 * uses `chartjs-node-canvas` (a real, offline, no-headless-browser Chart.js
 * server-side renderer, confirmed to install and render with ZERO extra
 * system packages on this project's bookworm-slim base image — only
 * `fontconfig`+a font package were added, purely for text quality, not
 * because rendering failed without them) — separate from, and does not
 * modify, the shared to-pdf.ts/to-xlsx.ts scheduled reports also depend on.
 *
 * `ReportResult` doesn't itself label which column is the "dimension" vs
 * "measure" (that distinction lives on `ReportDefinition`, not its output)
 * — inferred here instead via each column's own `format`: the first
 * text/date column becomes the chart's category labels, every currency/
 * number/percent/days column becomes its own data series. This works
 * generically across all 16 fixed report shapes without extra parameters.
 *
 * Returns `null` (not a thrown error) for chart types with no sensible
 * generic Chart.js mapping (`table`/`kpi`/`funnel`/`treemap`/`gauge`/
 * `combo`) or a result with no usable label/measure column pair — callers
 * should treat `null` as "no chart for this one," not a failure.
 */

const MAX_CHART_ROWS = 15;
const CHART_COLORS = ['#4f8cff', '#2f6fee', '#22a06b', '#e0a53a', '#d9534f', '#8b5cf6', '#0ea5e9', '#f472b6', '#84cc16', '#f59e0b'];

function isMeasureFormat(format: ReportColumn['format']): boolean {
  return format === 'currency' || format === 'number' || format === 'percent' || format === 'days';
}

function toNumber(value: ReportCellValue | undefined): number {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || 0 : 0;
}

function toLabel(value: ReportCellValue | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export async function renderReportChartImage(result: ReportResult, chartType: ReportChartType, title: string): Promise<Buffer | null> {
  const labelColumn = result.columns.find((c) => c.format === 'text') ?? result.columns.find((c) => c.format === 'date');
  const measureColumns = result.columns.filter((c) => isMeasureFormat(c.format));
  if (!labelColumn || measureColumns.length === 0 || result.rows.length === 0) return null;

  const isPieLike = chartType === 'pie' || chartType === 'donut';
  const chartJsType = ({ bar: 'bar', stackedBar: 'bar', line: 'line', area: 'line', pie: 'pie', donut: 'doughnut' } as const)[
    chartType as 'bar' | 'stackedBar' | 'line' | 'area' | 'pie' | 'donut'
  ];
  if (!chartJsType) return null; // table/kpi/funnel/treemap/gauge/combo — no generic mapping.

  // Rank by the first measure, cap to a readable number of categories —
  // an unpaginated report can have hundreds of rows, which would render as
  // an unreadable wall of bars/slices.
  const primaryMeasureKey = measureColumns[0]!.key;
  const sortedRows = [...result.rows].sort((a, b) => toNumber(b[primaryMeasureKey]) - toNumber(a[primaryMeasureKey]));
  const topRows = sortedRows.slice(0, MAX_CHART_ROWS);
  const overflowRows = sortedRows.slice(MAX_CHART_ROWS);

  const labels = topRows.map((r) => toLabel(r[labelColumn.key]));
  if (isPieLike && overflowRows.length > 0) {
    labels.push('Other');
  }

  const datasets: ChartDataset[] = measureColumns.map((measure, i) => {
    const data = topRows.map((r) => toNumber(r[measure.key]));
    if (isPieLike && overflowRows.length > 0) {
      data.push(overflowRows.reduce((sum, r) => sum + toNumber(r[measure.key]), 0));
    }
    return isPieLike
      ? { label: measure.label, data, backgroundColor: labels.map((_, idx) => CHART_COLORS[idx % CHART_COLORS.length]!) }
      : {
          label: measure.label,
          data,
          backgroundColor: CHART_COLORS[i % CHART_COLORS.length]!,
          borderColor: CHART_COLORS[i % CHART_COLORS.length]!,
          fill: chartType === 'area',
          stack: chartType === 'stackedBar' ? 'stack0' : undefined,
        };
  });

  const configuration: ChartConfiguration = {
    type: chartJsType,
    data: { labels, datasets },
    options: {
      plugins: { title: { display: true, text: title }, legend: { display: datasets.length > 1 || isPieLike } },
      scales: isPieLike
        ? undefined
        : {
            x: { stacked: chartType === 'stackedBar' },
            y: { stacked: chartType === 'stackedBar', beginAtZero: true },
          },
    },
  };

  const renderer = new ChartJSNodeCanvas({ width: 900, height: 540, backgroundColour: 'white' });
  return renderer.renderToBuffer(configuration, 'image/png');
}
