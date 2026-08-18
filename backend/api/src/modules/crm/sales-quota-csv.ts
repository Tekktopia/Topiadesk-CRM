import { stringify } from 'csv-stringify/sync';
import { type SalesQuota } from '@topiadesk/db';

/**
 * Export-only, matching the other CRM exporters.
 *
 * targetAmount is written with `.toString()`, never Number(): it is a
 * Decimal(15,2), and routing money through IEEE-754 on the way to a
 * spreadsheet is exactly how an export ends up off by a cent.
 *
 * The scope columns are deliberately all three (user/department/branch)
 * rather than one merged "scope" column — only one is populated per row
 * depending on scopeType, and a merged column would lose which kind of
 * scope an id referred to.
 */
const EXPORT_COLUMNS = [
  'scopeType',
  'ownerName',
  'departmentId',
  'branchId',
  'periodType',
  'periodStart',
  'periodEnd',
  'targetAmount',
  'lineOfBusiness',
  'createdAt',
] as const;

type SalesQuotaWithOwner = SalesQuota & { user?: { fullName: string | null } | null };

export function salesQuotasToCsv(quotas: SalesQuotaWithOwner[]): string {
  const rows = quotas.map((q) => ({
    scopeType: q.scopeType,
    ownerName: q.user?.fullName ?? '',
    departmentId: q.departmentId ?? '',
    branchId: q.branchId ?? '',
    periodType: q.periodType,
    periodStart: q.periodStart.toISOString().slice(0, 10),
    periodEnd: q.periodEnd.toISOString().slice(0, 10),
    targetAmount: q.targetAmount.toString(),
    lineOfBusiness: q.lineOfBusiness ?? '',
    createdAt: q.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
