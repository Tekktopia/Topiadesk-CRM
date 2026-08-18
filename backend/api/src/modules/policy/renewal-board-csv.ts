import { stringify } from 'csv-stringify/sync';
import type { RenewalBoardRowDto } from './dto/renewal-board.dto';

/**
 * Export-only, matching the other CSV exporters.
 *
 * `daysToExpiry` is included as its own column even though it's derivable
 * from expiryDate: the export exists so a renewals meeting can be run from a
 * spreadsheet, and "how long have I got" is the column people sort by.
 * Negative values mean the policy has already expired.
 */
const EXPORT_COLUMNS = [
  'policyNumber',
  'accountName',
  'carrierName',
  'lineOfBusiness',
  'expiryDate',
  'daysToExpiry',
  'renewalStatus',
  'assignedTo',
  'brokerOfRecord',
  'annualPremium',
  'currency',
] as const;

export function renewalBoardToCsv(rows: RenewalBoardRowDto[]): string {
  const mapped = rows.map((r) => ({
    policyNumber: r.policyNumber,
    accountName: r.accountName,
    carrierName: r.carrierName,
    lineOfBusiness: r.lineOfBusiness,
    expiryDate: r.expiryDate.toISOString().slice(0, 10),
    daysToExpiry: String(r.daysToExpiry),
    // "Not started" is a real, actionable state — distinct from a schedule
    // that exists and is merely ON_TRACK — so it is spelled out rather than
    // exported as an empty cell.
    renewalStatus: r.renewalStatus ?? (r.scheduleMissing ? 'NOT_STARTED' : ''),
    assignedTo: r.assignedToName ?? '',
    brokerOfRecord: r.brokerOfRecordName ?? '',
    annualPremium: r.annualPremiumBase.toFixed(2),
    currency: r.baseCurrency,
  }));
  return stringify(mapped, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
