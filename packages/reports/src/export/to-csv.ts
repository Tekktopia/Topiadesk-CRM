import type { ReportResult } from '../report-definition';

/** Hand-rolled per the brief ("a simple hand-rolled writer is fine") — RFC 4180 quoting only, no external dependency needed for something this small. */
export function reportResultToCsv(result: ReportResult): Buffer {
  const lines: string[] = [];
  lines.push(result.columns.map((c) => quoteCsvField(c.label)).join(','));
  for (const row of result.rows) {
    lines.push(result.columns.map((c) => quoteCsvField(formatCellForExport(row[c.key], c.format))).join(','));
  }
  return Buffer.from(lines.join('\r\n'), 'utf-8');
}

function quoteCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function formatCellForExport(value: unknown, format: string): string {
  if (value === null || value === undefined) return '';
  if (format === 'currency' && typeof value === 'number') return value.toFixed(2);
  if (format === 'percent' && typeof value === 'number') return `${value}%`;
  return String(value);
}
