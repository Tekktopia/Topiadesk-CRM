import { stringify } from 'csv-stringify/sync';
import { type Case } from '@topiadesk/db';

/**
 * Export-only, matching the CRM exporters. Relations (assignee, team,
 * category, account) are emitted as ids: this resolves no joins, and an id
 * round-trips unambiguously if the sheet is used to look tickets back up.
 */
const EXPORT_COLUMNS = [
  'caseNumber',
  'subject',
  'status',
  'priority',
  'caseType',
  'accountId',
  'contactId',
  'assignedToId',
  'assignedTeamId',
  'categoryId',
  'resolvedAt',
  'closedAt',
  'createdAt',
] as const;

function iso(value: Date | null): string {
  return value ? value.toISOString() : '';
}

export function casesToCsv(cases: Case[]): string {
  const rows = cases.map((c) => ({
    caseNumber: c.caseNumber,
    subject: c.subject,
    status: c.status,
    priority: c.priority,
    caseType: c.caseType,
    accountId: c.accountId ?? '',
    contactId: c.contactId ?? '',
    assignedToId: c.assignedToId ?? '',
    assignedTeamId: c.assignedTeamId ?? '',
    categoryId: c.categoryId ?? '',
    resolvedAt: iso(c.resolvedAt),
    closedAt: iso(c.closedAt),
    createdAt: c.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
