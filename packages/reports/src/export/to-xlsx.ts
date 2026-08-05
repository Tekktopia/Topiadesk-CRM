import ExcelJS from 'exceljs';
import type { ReportResult } from '../report-definition';

export async function reportResultToXlsx(result: ReportResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TopiaDesk CRM';
  workbook.created = new Date(result.generatedAt);

  const sheet = workbook.addWorksheet('Report');
  sheet.columns = result.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(14, c.label.length + 2),
    style: c.format === 'currency' ? { numFmt: '#,##0.00' } : c.format === 'percent' ? { numFmt: '0.0"%"' } : undefined,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of result.rows) sheet.addRow(row);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
