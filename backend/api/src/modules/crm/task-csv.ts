import { stringify } from 'csv-stringify/sync';
import { type Task } from '@topiadesk/db';

/**
 * Export-only, matching the other CRM exporters. Parent links are emitted as
 * ids: a task can hang off any one of account/policy/opportunity/lead/claim/
 * case, and resolving whichever is set into a display name would mean five
 * conditional joins for a column nobody sorts on.
 */
const EXPORT_COLUMNS = [
  'title',
  'status',
  'priority',
  'dueDate',
  'completedAt',
  'assigneeId',
  'accountId',
  'policyId',
  'opportunityId',
  'leadId',
  'claimId',
  'caseId',
  'description',
  'createdAt',
] as const;

function iso(value: Date | null): string {
  return value ? value.toISOString() : '';
}

export function tasksToCsv(tasks: Task[]): string {
  const rows = tasks.map((t) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: iso(t.dueDate),
    completedAt: iso(t.completedAt),
    assigneeId: t.assigneeId,
    accountId: t.accountId ?? '',
    policyId: t.policyId ?? '',
    opportunityId: t.opportunityId ?? '',
    leadId: t.leadId ?? '',
    claimId: t.claimId ?? '',
    caseId: t.caseId ?? '',
    description: t.description ?? '',
    createdAt: t.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
