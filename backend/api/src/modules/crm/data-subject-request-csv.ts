import { stringify } from 'csv-stringify/sync';
import { type DataSubjectRequest } from '@topiadesk/db';

/**
 * Export-only, matching the other CRM exporters. This is the compliance
 * REGISTER — the evidence that requests were received and answered inside
 * the statutory window — not the data those requests produced.
 *
 * `exportData` is deliberately excluded. It holds a full PII snapshot of the
 * subject (name, email, phone, ID document numbers, every activity), so
 * including it would turn a routine "download the request log" click into a
 * bulk PII extract of everyone who ever asked for their data — the opposite
 * of what a data-protection register is for. Same reasoning that keeps
 * idType/idNumber out of contact-csv.ts. The snapshot stays viewable
 * one-at-a-time from the request itself, where the access is deliberate.
 *
 * Contact names are included because a register that only lists opaque UUIDs
 * cannot be reviewed. For a fulfilled erasure the name reads "[Redacted]" —
 * the anonymization already happened on the contact row, so the register
 * inherits it rather than needing its own special case.
 */
const EXPORT_COLUMNS = [
  'requestType',
  'status',
  'contactName',
  'requestedAt',
  'processedAt',
  'daysToResolve',
  'notes',
] as const;

type DataSubjectRequestWithContact = DataSubjectRequest & {
  contact?: { firstName: string | null; lastName: string | null } | null;
};

function contactName(request: DataSubjectRequestWithContact): string {
  const first = request.contact?.firstName ?? '';
  const last = request.contact?.lastName ?? '';
  const full = `${first} ${last}`.trim();
  return full || request.contactId;
}

export function dataSubjectRequestsToCsv(requests: DataSubjectRequestWithContact[]): string {
  const rows = requests.map((r) => ({
    requestType: r.requestType,
    status: r.status,
    contactName: contactName(r),
    requestedAt: r.createdAt.toISOString(),
    processedAt: r.processedAt ? r.processedAt.toISOString() : '',
    // Whole days, floored — the regulator's question is "was this answered
    // within N days", which a fractional day never changes the answer to.
    daysToResolve: r.processedAt
      ? String(Math.floor((r.processedAt.getTime() - r.createdAt.getTime()) / 86_400_000))
      : '',
    notes: r.notes ?? '',
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
