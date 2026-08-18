import { stringify } from 'csv-stringify/sync';
import { type Contact } from '@topiadesk/db';

/**
 * Export-only, matching lead-csv.ts / opportunity-csv.ts.
 *
 * `idType`/`idNumber` are deliberately NOT exported. They are KYC identity
 * documents (NIN, passport, BVN), they are already governed by field-level
 * visibility on the read path, and a CSV is the easiest artifact in the
 * product to forward outside the org. The columns below are the ones needed
 * to actually contact a person; identity documents are not.
 */
const EXPORT_COLUMNS = [
  'firstName',
  'lastName',
  'title',
  'email',
  'phone',
  'isPrimary',
  'householdRole',
  'accountId',
  'carrierId',
  'createdAt',
] as const;

export function contactsToCsv(contacts: Contact[]): string {
  const rows = contacts.map((c) => ({
    firstName: c.firstName,
    lastName: c.lastName,
    title: c.title ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    isPrimary: c.isPrimary ? 'yes' : 'no',
    householdRole: c.householdRole ?? '',
    accountId: c.accountId ?? '',
    carrierId: c.carrierId ?? '',
    createdAt: c.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
