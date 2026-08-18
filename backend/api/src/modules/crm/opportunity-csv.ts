import { stringify } from 'csv-stringify/sync';
import { type Opportunity } from '@topiadesk/db';

/**
 * Export-only, matching lead-csv.ts. Deals are created in-app through the
 * pipeline UI (or by converting a Lead), never bulk-uploaded, so there is
 * no importer counterpart.
 *
 * `amount` and `currency` are emitted as SEPARATE columns and the amount is
 * NOT converted to the base currency. A spreadsheet of pre-converted
 * numbers silently bakes in whatever ExchangeRate happened to be loaded at
 * export time and cannot be audited afterwards; the raw pair is what the
 * record actually says. The currency-normalized totals live on the stats
 * endpoint, where the conversion is explicit and labelled.
 *
 * Stage/account/owner are ids rather than names: this file resolves no
 * relations, and an id round-trips unambiguously if the sheet is ever used
 * to look records back up.
 */
const EXPORT_COLUMNS = [
  'name',
  'accountId',
  'amount',
  'currency',
  'probability',
  'pipelineStageId',
  'ownerId',
  'lineOfBusiness',
  'expectedCloseDate',
  'actualCloseDate',
  'dealHealthScore',
  'wonReason',
  'lostReason',
  'createdAt',
] as const;

/** Date-only columns (`@db.Date`) — slicing the ISO string keeps them from rendering as midnight timestamps in Excel. */
function isoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

export function opportunitiesToCsv(opportunities: Opportunity[]): string {
  const rows = opportunities.map((o) => ({
    name: o.name,
    accountId: o.accountId,
    // Decimal -> string via toString(), never Number(): a 15,2 decimal can
    // exceed IEEE-754 integer precision, and this is money.
    amount: o.amount.toString(),
    currency: o.currency,
    probability: o.probability,
    pipelineStageId: o.pipelineStageId,
    ownerId: o.ownerId,
    lineOfBusiness: o.lineOfBusiness ?? '',
    expectedCloseDate: isoDate(o.expectedCloseDate),
    actualCloseDate: isoDate(o.actualCloseDate),
    dealHealthScore: o.dealHealthScore ?? '',
    wonReason: o.wonReason ?? '',
    lostReason: o.lostReason ?? '',
    createdAt: o.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
