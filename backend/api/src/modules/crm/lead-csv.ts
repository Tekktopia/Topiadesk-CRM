import { stringify } from 'csv-stringify/sync';
import { type Lead } from '@topiadesk/db';

/**
 * Export-only, deliberately narrower than account-csv.ts, which also
 * imports. Leads arrive through the capture/assignment pipeline
 * (assignment-resolver.util.ts) rather than bulk spreadsheet upload, so a
 * round-tripping importer here would be a path nothing currently asks for;
 * this exists for the "hand the qualified list to someone in Excel" case.
 *
 * `source` is emitted as the raw LeadSource.code rather than its display
 * name — the code is the stable natural key (see the Lead.source comment in
 * schema.prisma), so an exported file stays meaningful even if an admin
 * later renames the source's label.
 */
const EXPORT_COLUMNS = [
  'firstName',
  'lastName',
  'companyName',
  'email',
  'phone',
  'source',
  'sourceCampaign',
  'score',
  'status',
  'qualificationNotes',
  'createdAt',
] as const;

export function leadsToCsv(leads: Lead[]): string {
  const rows = leads.map((l) => ({
    firstName: l.firstName,
    lastName: l.lastName,
    companyName: l.companyName ?? '',
    email: l.email ?? '',
    phone: l.phone ?? '',
    source: l.source,
    sourceCampaign: l.sourceCampaign ?? '',
    score: l.score,
    status: l.status,
    qualificationNotes: l.qualificationNotes ?? '',
    createdAt: l.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
