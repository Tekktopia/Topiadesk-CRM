import ExcelJS from 'exceljs';
import type { ReportResult } from '../report-definition';

// Same blue as to-pdf.ts's header band / to-chart-image.ts's first chart
// color — one consistent brand color across every export format.
const BRAND_COLOR = 'FF2F6FEE';
const HEADER_TEXT_COLOR = 'FFFFFFFF';
const ROW_BAND_COLOR = 'FFF4F7FF';
const BORDER_COLOR = 'FFDFE4EE';

const thinBorder = { style: 'thin' as const, color: { argb: BORDER_COLOR } };

export async function reportResultToXlsx(result: ReportResult, chartImage?: Buffer | null): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TopiaDesk CRM';
  workbook.created = new Date(result.generatedAt);

  const sheet = workbook.addWorksheet('Report');

  // Chart, if any, sits above the table — push the header row down to make
  // room and anchor the image into that reserved band.
  let headerRowNumber = 1;
  if (chartImage) {
    // ExcelJS's own .d.ts pins a structurally-older, non-generic `Buffer`
    // shape that @types/node ^22's generic `Buffer<ArrayBufferLike>` can't
    // structurally unify with — same runtime type, no valid TS cast
    // between the two exists short of `any`. Known cross-package mismatch,
    // not a real type error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageId = workbook.addImage({ buffer: chartImage as any, extension: 'png' });
    // ~18 rows tall at the default ~15px row height covers the chart's
    // 540px render height (to-chart-image.ts) with a little breathing room.
    const chartRows = 18;
    sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 720, height: 432 } });
    headerRowNumber = chartRows + 2;
    for (let i = 1; i < headerRowNumber; i++) sheet.getRow(i).height = 15;
  }

  sheet.columns = result.columns.map((c) => ({
    key: c.key,
    width: Math.max(14, c.label.length + 2),
    style: c.format === 'currency' ? { numFmt: '#,##0.00' } : c.format === 'percent' ? { numFmt: '0.0"%"' } : undefined,
  }));

  const headerRow = sheet.getRow(headerRowNumber);
  result.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: HEADER_TEXT_COLOR } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_COLOR } };
    cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    cell.alignment = { vertical: 'middle' };
  });
  headerRow.commit();

  result.rows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(headerRowNumber + 1 + rowIndex);
    result.columns.forEach((col, i) => {
      const cell = sheetRow.getCell(i + 1);
      cell.value = row[col.key];
      cell.border = { bottom: thinBorder };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_BAND_COLOR } };
      }
      if (col.format === 'currency' || col.format === 'number' || col.format === 'percent' || col.format === 'days') {
        cell.alignment = { horizontal: 'right' };
      }
    });
    sheetRow.commit();
  });

  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: result.columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
