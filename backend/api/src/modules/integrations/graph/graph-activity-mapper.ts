import type { ActivityType, Prisma } from '@topiadesk/db';

/**
 * Maps Microsoft Graph objects onto Activity rows.
 *
 * IDEMPOTENCY IS THE WHOLE POINT of this file. Delta sync re-delivers the
 * same item whenever it changes, and webhook notifications can arrive more
 * than once for a single change — so any mapping that inserted blindly would
 * fill a client's timeline with duplicate meetings and emails. That is worse
 * than having no sync at all, because it corrupts the record the firm relies
 * on rather than merely omitting from it.
 *
 * The dedupe key is Activity.externalMessageId, which already carries a
 * UNIQUE constraint and is already used by the inbound-email pipeline. Graph
 * ids are namespaced (`graph-event:` / `graph-message:`) so they can never
 * collide with a real RFC 5322 Message-ID arriving through that older path.
 */
export const GRAPH_EVENT_PREFIX = 'graph-event:';
export const GRAPH_MESSAGE_PREFIX = 'graph-message:';

export function graphEventKey(eventId: string): string {
  return `${GRAPH_EVENT_PREFIX}${eventId}`;
}
export function graphMessageKey(messageId: string): string {
  return `${GRAPH_MESSAGE_PREFIX}${messageId}`;
}

/** The subset of a Graph calendar event this mapping needs. */
export interface GraphEvent {
  id: string;
  subject?: string | null;
  bodyPreview?: string | null;
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
  attendees?: { emailAddress?: { address?: string | null } | null }[] | null;
  organizer?: { emailAddress?: { address?: string | null } | null } | null;
  isCancelled?: boolean | null;
  '@removed'?: unknown;
}

/** The subset of a Graph mail message this mapping needs. */
export interface GraphMessage {
  id: string;
  subject?: string | null;
  bodyPreview?: string | null;
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  from?: { emailAddress?: { address?: string | null } | null } | null;
  toRecipients?: { emailAddress?: { address?: string | null } | null }[] | null;
  isDraft?: boolean | null;
  '@removed'?: unknown;
}

export interface MappedActivity {
  externalMessageId: string;
  type: ActivityType;
  direction: 'INBOUND' | 'OUTBOUND';
  subject: string;
  body: string | null;
  occurredAt: Date;
  durationMinutes: number | null;
  /** Every address on the item, for matching against known contacts. */
  participantEmails: string[];
}

function addresses(list: { emailAddress?: { address?: string | null } | null }[] | null | undefined): string[] {
  return (list ?? [])
    .map((a) => a.emailAddress?.address?.toLowerCase().trim())
    .filter((a): a is string => Boolean(a));
}

/**
 * A cancelled or deleted event still maps — the caller decides whether to
 * remove the activity — so that a meeting cancelled in Outlook doesn't linger
 * on a client's timeline as if it happened.
 */
export function isRemoved(item: { '@removed'?: unknown; isCancelled?: boolean | null }): boolean {
  return Boolean(item['@removed']) || item.isCancelled === true;
}

export function mapEvent(event: GraphEvent, mailboxUpn: string): MappedActivity | null {
  const startIso = event.start?.dateTime;
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;

  const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
  const durationMinutes =
    end && !Number.isNaN(end.getTime()) ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)) : null;

  const organizer = event.organizer?.emailAddress?.address?.toLowerCase().trim() ?? null;
  // Direction here means "did we call this meeting or were we invited" —
  // the same in/out sense the rest of the timeline uses.
  const direction = organizer && organizer === mailboxUpn.toLowerCase() ? 'OUTBOUND' : 'INBOUND';

  return {
    externalMessageId: graphEventKey(event.id),
    type: 'MEETING',
    direction,
    subject: event.subject?.trim() || '(no subject)',
    body: event.bodyPreview?.trim() || null,
    occurredAt: start,
    durationMinutes,
    participantEmails: [...new Set([...(organizer ? [organizer] : []), ...addresses(event.attendees)])],
  };
}

export function mapMessage(message: GraphMessage, mailboxUpn: string): MappedActivity | null {
  // Drafts are not correspondence — nothing has been sent, so logging one
  // would put an unsent email on a client's record.
  if (message.isDraft) return null;

  const iso = message.receivedDateTime ?? message.sentDateTime;
  if (!iso) return null;
  const occurredAt = new Date(iso);
  if (Number.isNaN(occurredAt.getTime())) return null;

  const from = message.from?.emailAddress?.address?.toLowerCase().trim() ?? null;
  const direction = from && from === mailboxUpn.toLowerCase() ? 'OUTBOUND' : 'INBOUND';

  return {
    externalMessageId: graphMessageKey(message.id),
    type: 'EMAIL',
    direction,
    subject: message.subject?.trim() || '(no subject)',
    body: message.bodyPreview?.trim() || null,
    occurredAt,
    durationMinutes: null,
    participantEmails: [...new Set([...(from ? [from] : []), ...addresses(message.toRecipients)])],
  };
}

/**
 * Builds the upsert for one mapped item.
 *
 * `update` deliberately does NOT touch createdById: the row may already exist
 * from a manual log, and a later Graph delta must not silently reassign
 * authorship of something a person wrote.
 */
export function toUpsert(
  mapped: MappedActivity,
  link: { accountId?: string | null; contactId?: string | null },
): Prisma.ActivityUpsertArgs {
  const common = {
    type: mapped.type,
    direction: mapped.direction,
    subject: mapped.subject,
    body: mapped.body,
    occurredAt: mapped.occurredAt,
    durationMinutes: mapped.durationMinutes,
    accountId: link.accountId ?? null,
    contactId: link.contactId ?? null,
  };
  return {
    where: { externalMessageId: mapped.externalMessageId },
    create: { ...common, externalMessageId: mapped.externalMessageId },
    update: common,
  };
}
