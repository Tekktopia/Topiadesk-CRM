import { stringify } from 'csv-stringify/sync';

/**
 * Export-only, matching the CRM exporters.
 *
 * Takes the already-mapped response shape rather than a Prisma row: the
 * points balance is not a stored column (see LoyaltyAccount's schema
 * comment), it only exists once the controller's LATERAL SUM has run, so
 * there is no "model row" to hand this function.
 */
const EXPORT_COLUMNS = ['accountName', 'tier', 'pointsBalance', 'enrolledAt'] as const;

export interface LoyaltyCsvRow {
  accountName?: string;
  tier: string;
  pointsBalance: number;
  enrolledAt: Date;
}

export function loyaltyAccountsToCsv(accounts: LoyaltyCsvRow[]): string {
  const rows = accounts.map((a) => ({
    accountName: a.accountName ?? '',
    tier: a.tier,
    pointsBalance: String(a.pointsBalance),
    enrolledAt: a.enrolledAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
