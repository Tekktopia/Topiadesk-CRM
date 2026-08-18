import { stringify } from 'csv-stringify/sync';
import type { CrossSellRowDto } from './dto/cross-sell.dto';

/**
 * Export-only, matching the other CRM exporters.
 *
 * Lines are joined with ';' rather than ',' so a multi-line cell survives a
 * CSV round-trip without quoting — the same convention account-csv.ts uses
 * for tags. `linesMissing` is the column this export exists for: it is the
 * call list a producer works from.
 */
const EXPORT_COLUMNS = ['accountName', 'status', 'owner', 'linesHeld', 'linesMissing', 'gapCount', 'policyCount', 'premium', 'currency'] as const;

export function crossSellToCsv(rows: CrossSellRowDto[]): string {
  const mapped = rows.map((r) => ({
    accountName: r.accountName,
    status: r.status,
    owner: r.ownerName ?? '',
    linesHeld: r.linesHeld.join(';'),
    linesMissing: r.linesMissing.join(';'),
    gapCount: String(r.linesMissing.length),
    policyCount: String(r.policyCount),
    premium: r.premiumBase.toFixed(2),
    currency: r.baseCurrency,
  }));
  return stringify(mapped, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
