import { stringify } from 'csv-stringify/sync';
import { type Claim } from '@topiadesk/db';

/**
 * Export-only, matching the CRM exporters.
 *
 * Money columns are emitted RAW (the claim's own figures, un-converted) with
 * no currency column of their own, because Claim inherits Policy.currency and
 * this exporter resolves no relations. The currency-normalized totals live on
 * the stats endpoint where the conversion is explicit and labelled — a
 * spreadsheet of silently-converted amounts cannot be audited afterwards.
 */
const EXPORT_COLUMNS = [
  'claimNumber',
  'status',
  'priority',
  'dateOfLoss',
  'dateReported',
  'causeOfLoss',
  'reserveAmount',
  'settledAmount',
  'settledAt',
  'repudiationReason',
  'reopenCount',
  'policyId',
  'adjusterId',
  'createdAt',
] as const;

/** Date-only columns (@db.Date) — slice so Excel doesn't render them as midnight timestamps. */
function isoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

export function claimsToCsv(claims: Claim[]): string {
  const rows = claims.map((c) => ({
    claimNumber: c.claimNumber,
    status: c.status,
    priority: c.priority,
    dateOfLoss: isoDate(c.dateOfLoss),
    dateReported: isoDate(c.dateReported),
    causeOfLoss: c.causeOfLoss ?? '',
    // Decimal -> toString(), never Number(): an 18,2 decimal can exceed
    // IEEE-754 integer precision, and this is money.
    reserveAmount: c.reserveAmount?.toString() ?? '',
    settledAmount: c.settledAmount?.toString() ?? '',
    settledAt: c.settledAt ? c.settledAt.toISOString() : '',
    repudiationReason: c.repudiationReason ?? '',
    reopenCount: c.reopenCount,
    policyId: c.policyId,
    adjusterId: c.adjusterId ?? '',
    createdAt: c.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
