import type { ReportChartType, ReportResult } from '../report-definition';
import { reportResultToCsv } from './to-csv';
import { reportResultToXlsx } from './to-xlsx';
import { reportResultToPdf } from './to-pdf';
import { renderReportChartImage } from './to-chart-image';

// 'png' added for renderReportChartImage() (to-chart-image.ts) — a chart
// image, not a table export, so it's deliberately NOT one of
// renderReportExport()'s switch cases below (that function's `(result,
// format, title)` shape is specific to the csv/xlsx/pdf table trio). It's
// included in this type/map purely so a chart PNG can reuse
// uploadReportFile()/getReportDownloadUrl() unchanged — both are typed
// against ReportExportFormat and keyed off EXPORT_CONTENT_TYPE.
export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf' | 'png';

export const EXPORT_CONTENT_TYPE: Record<ReportExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  png: 'image/png',
};

/**
 * Table export only — 'png' is deliberately not handled here, see the
 * ReportExportFormat comment above. `chartType`, when given, embeds a
 * chart image (via renderReportChartImage) into pdf/xlsx output — ignored
 * for csv, which has no visual concept to embed into. A `null` return from
 * renderReportChartImage (no sensible chart for this result/chartType,
 * e.g. 'table'/'kpi') just means the table renders without one — never a
 * failure.
 */
export async function renderReportExport(
  result: ReportResult,
  format: Exclude<ReportExportFormat, 'png'>,
  title: string,
  chartType?: ReportChartType,
): Promise<Buffer> {
  switch (format) {
    case 'csv':
      return reportResultToCsv(result);
    case 'xlsx': {
      const chartImage = chartType ? await renderReportChartImage(result, chartType, title) : null;
      return reportResultToXlsx(result, chartImage);
    }
    case 'pdf': {
      const chartImage = chartType ? await renderReportChartImage(result, chartType, title) : null;
      return reportResultToPdf(result, title, chartImage);
    }
  }
}

export { reportResultToCsv } from './to-csv';
export { reportResultToXlsx } from './to-xlsx';
export { reportResultToPdf } from './to-pdf';
export { renderReportChartImage } from './to-chart-image';
