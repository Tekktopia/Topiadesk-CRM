import { randomBytes } from 'node:crypto';
import { getPrismaClient } from '@topiadesk/db';

/** Same shape as cases.controller.ts's private generateCaseNumber() — duplicated rather than exported cross-module, since case-management owns that controller and this module intentionally has no dependency on it beyond the small SLA/automation-event utils it already exposes. */
export function generateCaseNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `CASE-${datePart}-${suffix}`;
}

/**
 * Threading for inbound-email/WhatsApp/SMS webhooks: a reply's
 * `inReplyTo`/correlation value is matched against the PARENT message's own
 * `externalMessageId`. The parent's `externalThreadId` (or, if the parent
 * was itself the thread root, its own `externalMessageId`) becomes this new
 * message's `externalThreadId` — so every message in a thread ends up
 * carrying the same `externalThreadId`, and the whole thread always maps to
 * one Case (`activity.caseId`).
 */
export async function findParentActivityForThreading(parentMessageId: string): Promise<{ caseId: string | null; threadId: string } | null> {
  const parent = await getPrismaClient().activity.findFirst({
    where: { externalMessageId: parentMessageId },
    select: { caseId: true, externalThreadId: true, externalMessageId: true },
  });
  if (!parent) return null;
  return { caseId: parent.caseId, threadId: parent.externalThreadId ?? parent.externalMessageId ?? parentMessageId };
}

/** Finds the most recent still-open Case for this channel correlated by sender identity (channelDetail — a phone number for WhatsApp/SMS, an email address for live chat) — those channels don't give a clean reply-to message id the way email-to-case does, so correlation is by sender identity instead. */
export async function findOpenCaseByChannelDetail(channelDetail: string, sourceChannel: 'WHATSAPP' | 'SMS' | 'LIVE_CHAT'): Promise<{ id: string } | null> {
  const activity = await getPrismaClient().activity.findFirst({
    where: { channelDetail, type: sourceChannel, case: { status: { notIn: ['RESOLVED', 'CLOSED'] } } },
    orderBy: { createdAt: 'desc' },
    select: { caseId: true },
  });
  return activity?.caseId ? { id: activity.caseId } : null;
}
