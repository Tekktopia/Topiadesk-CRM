import PDFDocument from 'pdfkit';
import type { ReportResult } from '../report-definition';
import { formatCellForExport } from './to-csv';

/**
 * Deliberately basic per the brief ("a simple lightweight approach is
 * acceptable... don't pull in a heavy headless-browser dependency") — a
 * plain paginated table, no charts/branding. pdfkit streams; buffered here
 * since the caller (export controller / worker delivery job) needs one
 * complete Buffer to hand to MinIO's PutObjectCommand or an email
 * attachment, not a stream.
 */
export function reportResultToPdf(result: ReportResult, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: result.columns.length > 5 ? 'landscape' : 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = pageWidth / Math.max(1, result.columns.length);
    const rowHeight = 18;

    doc.fontSize(16).text(title, { underline: true });
    doc.fontSize(9).fillColor('#555').text(`Generated ${result.generatedAt} — ${result.totalRowCount} row(s)`);
    doc.moveDown(0.5);

    const drawHeader = () => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      result.columns.forEach((col, i) => {
        doc.text(col.label, doc.page.margins.left + i * columnWidth, y, { width: columnWidth, ellipsis: true });
      });
      doc.moveDown();
      doc.font('Helvetica').fontSize(8);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#ccc')
        .stroke();
      doc.moveDown(0.3);
    };

    drawHeader();

    for (const row of result.rows) {
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      result.columns.forEach((col, i) => {
        doc.text(formatCellForExport(row[col.key], col.format), doc.page.margins.left + i * columnWidth, y, {
          width: columnWidth,
          ellipsis: true,
        });
      });
      doc.moveDown(0.9);
    }

    doc.end();
  });
}
