import { stringify } from 'csv-stringify/sync';
import { type Carrier } from '@topiadesk/db';

/**
 * Export-only, matching the other CRM exporters.
 *
 * `linesOfBusiness` is a String[]; it is joined with ';' rather than ','
 * so the value survives a CSV round-trip without needing the whole field
 * quoted-and-escaped — the same convention account-csv.ts uses for tags.
 */
const EXPORT_COLUMNS = [
  'name',
  'carrierType',
  'panelStatus',
  'amBestRating',
  'linesOfBusiness',
  'treatyType',
  'commissionTerms',
  'createdAt',
] as const;

export function carriersToCsv(carriers: Carrier[]): string {
  const rows = carriers.map((c) => ({
    name: c.name,
    carrierType: c.carrierType,
    panelStatus: c.panelStatus ?? '',
    amBestRating: c.amBestRating ?? '',
    linesOfBusiness: c.linesOfBusiness.join(';'),
    treatyType: c.treatyType ?? '',
    commissionTerms: c.commissionTerms ?? '',
    createdAt: c.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
