import PDFDocument from 'pdfkit';
import type { ReportResult, ReportValueFormat } from '../report-definition';
import { formatCellForExport } from './to-csv';

/**
 * Still pdfkit, not a headless-browser renderer — that constraint from the
 * original brief ("don't pull in a heavy headless-browser dependency")
 * stands. What changed: a real header/row styling pass (fill, borders,
 * alternating bands, right-aligned numbers, page footer) and an optional
 * chart image embedded above the table, reusing the same PNG
 * `renderReportChartImage()` (to-chart-image.ts) already produces for
 * chat's standalone chart attachment — see export/index.ts's
 * `renderReportExport()` for where that gets wired in. pdfkit streams;
 * buffered here since the caller (export controller / worker delivery job)
 * needs one complete Buffer to hand to MinIO's PutObjectCommand or an
 * email attachment, not a stream.
 */

// Matches to-chart-image.ts's first CHART_COLORS entry — same blue used for
// chart bars/lines and this PDF's header band, so a report's chart and its
// table read as one document, not two mismatched halves.
const BRAND_COLOR = '#2f6fee';
const HEADER_TEXT_COLOR = '#ffffff';
const ROW_BAND_COLOR = '#f4f7ff';
const GRIDLINE_COLOR = '#dfe4ee';
const MUTED_TEXT_COLOR = '#6b7280';

const RIGHT_ALIGN_FORMATS: ReadonlySet<ReportValueFormat> = new Set(['currency', 'number', 'percent', 'days']);

export function reportResultToPdf(result: ReportResult, title: string, chartImage?: Buffer | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: result.columns.length > 5 ? 'landscape' : 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = pageWidth / Math.max(1, result.columns.length);
    const rowHeight = 20;
    const headerHeight = 22;
    let pageNumber = 1;

    doc.fontSize(16).fillColor('#111827').font('Helvetica-Bold').text(title);
    doc.fontSize(9).fillColor(MUTED_TEXT_COLOR).font('Helvetica').text(`Generated ${result.generatedAt} — ${result.totalRowCount} row(s)`);
    doc.moveDown(0.75);

    if (chartImage) {
      // Cap height so a chart never eats most of the first page — width
      // scales to fit, aspect ratio preserved (pdfkit's `fit` does both).
      const chartHeight = 220;
      doc.image(chartImage, doc.page.margins.left, doc.y, { fit: [pageWidth, chartHeight], align: 'center' });
      doc.y += chartHeight + 12;
    }

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(doc.page.margins.left, y, pageWidth, headerHeight).fill(BRAND_COLOR);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(HEADER_TEXT_COLOR);
      result.columns.forEach((col, i) => {
        const align = RIGHT_ALIGN_FORMATS.has(col.format) ? 'right' : 'left';
        doc.text(col.label, doc.page.margins.left + i * columnWidth + 4, y + 6, { width: columnWidth - 8, ellipsis: true, align });
      });
      doc.y = y + headerHeight;
    };

    const drawFooter = () => {
      // Inside the bottom margin, not past it — pdfkit auto-inserts a new
      // page for any .text() call whose y falls beyond page.height minus
      // the bottom margin (confirmed live: an earlier version placed this
      // just past that boundary and every render grew a spurious blank
      // trailing page).
      const y = doc.page.height - doc.page.margins.bottom - 14;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED_TEXT_COLOR)
        .text(`Page ${pageNumber}`, doc.page.margins.left, y, { width: pageWidth, align: 'center' });
    };

    const ensureSpace = () => {
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        drawFooter();
        pageNumber += 1;
        doc.addPage();
        drawHeader();
      }
    };

    drawHeader();

    result.rows.forEach((row, rowIndex) => {
      ensureSpace();
      const y = doc.y;

      if (rowIndex % 2 === 1) {
        doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill(ROW_BAND_COLOR);
      }
      doc
        .moveTo(doc.page.margins.left, y + rowHeight)
        .lineTo(doc.page.width - doc.page.margins.right, y + rowHeight)
        .strokeColor(GRIDLINE_COLOR)
        .lineWidth(0.5)
        .stroke();

      doc.font('Helvetica').fontSize(8.5).fillColor('#1f2937');
      result.columns.forEach((col, i) => {
        const align = RIGHT_ALIGN_FORMATS.has(col.format) ? 'right' : 'left';
        doc.text(formatCellForExport(row[col.key], col.format), doc.page.margins.left + i * columnWidth + 4, y + 5, {
          width: columnWidth - 8,
          ellipsis: true,
          align,
        });
      });
      doc.y = y + rowHeight;
    });

    drawFooter();
    doc.end();
  });
}
