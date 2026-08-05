import type { ReportResult } from '../report-definition';
import { reportResultToCsv } from './to-csv';
import { reportResultToXlsx } from './to-xlsx';
import { reportResultToPdf } from './to-pdf';

export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';

export const EXPORT_CONTENT_TYPE: Record<ReportExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export async function renderReportExport(result: ReportResult, format: ReportExportFormat, title: string): Promise<Buffer> {
  switch (format) {
    case 'csv':
      return reportResultToCsv(result);
    case 'xlsx':
      return reportResultToXlsx(result);
    case 'pdf':
      return reportResultToPdf(result, title);
  }
}

export { reportResultToCsv } from './to-csv';
export { reportResultToXlsx } from './to-xlsx';
export { reportResultToPdf } from './to-pdf';
