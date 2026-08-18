/**
 * Consumer side of an agent's OUTBOUND comment on a Case actually reaching
 * the customer by email — see comments.service.ts's create() for the
 * producer side. Until now, `direction: 'OUTBOUND'` only meant "counts
 * toward the FIRST_RESPONSE SLA clock"; no email was ever sent, so an
 * agent "replying" to a case reached nobody outside TopiaDesk.
 *
 * Email resolution mirrors ../surveys/send-case-survey-invite.job.ts's
 * resolveRespondentEmail() exactly (Case's own Contact first, else the
 * linked Account's primary Contact) — same reasoning, not re-derived.
 *
 * Threading mirrors the INBOUND pipeline's own convention
 * (backend/api/src/modules/omnichannel/omnichannel.util.ts's
 * findParentActivityForThreading — every message in a thread shares one
 * externalThreadId; a thread root's own externalMessageId becomes its
 * externalThreadId). Duplicated here rather than imported — api and worker
 * are independently deployable apps with no shared package for this, same
 * boundary every other worker job in this directory respects. Closing this
 * loop is what lets a real customer reply-by-email later re-thread
 * correctly through the existing InboundEmailController.
 */
import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { sendMail } from '../scheduled-reports/mailer';

export const CASE_OUTBOUND_EMAIL_QUEUE_NAME = 'case-outbound-email';

export interface SendCaseCommentEmailJobData {
  activityId: string;
  caseId: string;
  /** Explicit recipient override (SendCaseEmailDialog's To/Cc) — omitted/empty falls back to resolveCaseEmail() below, same as before this existed. */
  to?: string[];
  cc?: string[];
  /**
   * The tenant schema the Activity/Case live in, captured by the producer
   * from the originating request's RLS context. See the matching comment on
   * CaseCommentEmailPayload in the api — omitting this bound every lookup
   * below to `public` and silently dropped every real tenant's outbound
   * email. Optional only so jobs enqueued before this field existed still
   * parse; they fall back to the old (public) behaviour.
   */
  tenantSchema?: string | null;
}

async function resolveCaseEmail(caseId: string): Promise<string | null> {
  const prisma = getPrismaClient();
  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      contact: true,
      account: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
    },
  });
  if (!kase) return null;
  return kase.contact?.email ?? kase.account?.contacts[0]?.email ?? null;
}

export async function sendCaseCommentEmail(
  data: SendCaseCommentEmailJobData,
): Promise<{ status: 'sent' | 'skipped-no-email' | 'skipped-not-found' | 'failed' }> {
  // `{ ...SYSTEM_JOB_CONTEXT, tenantSchema }` — the same pattern every other
  // tenant-aware job here uses (see kyc-expiry-check.job.ts). Bare
  // SYSTEM_JOB_CONTEXT pins tenantSchema to null, i.e. the `public` schema,
  // which is why this job kept reporting 'skipped-not-found' for tickets
  // that plainly existed.
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: data.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();

    const [activity, kase] = await Promise.all([
      prisma.activity.findUnique({ where: { id: data.activityId } }),
      prisma.case.findUnique({ where: { id: data.caseId } }),
    ]);
    if (!activity || !kase) {
      // Loud on purpose: this is indistinguishable from success in BullMQ
      // (the job still "completes"), and it silently swallowed every
      // outbound email for months. If it fires now it means a genuinely
      // missing row, not a schema mix-up.
      console.error(
        `[case-outbound-email] NOT SENT — activity ${data.activityId} / case ${data.caseId} not found in schema ` +
          `"${data.tenantSchema ?? 'public'}" (activity=${Boolean(activity)}, case=${Boolean(kase)})`,
      );
      return { status: 'skipped-not-found' };
    }

    let to = data.to?.filter(Boolean) ?? [];
    if (to.length === 0) {
      const resolved = await resolveCaseEmail(data.caseId);
      if (resolved) to = [resolved];
    }
    if (to.length === 0) {
      console.warn(
        `[case-outbound-email] NOT SENT — no recipient resolved for activity ${data.activityId} / case ${data.caseId}; ` +
          'the case has no contact email and its account has no primary contact email.',
      );
      await prisma.activity.update({ where: { id: data.activityId }, data: { emailDeliveryStatus: 'SKIPPED_NO_EMAIL' } });
      return { status: 'skipped-no-email' };
    }
    const cc = data.cc?.filter(Boolean) ?? [];

    // Reply parent: the case's most recent OTHER activity that's already
    // part of an email thread (inbound or a prior outbound reply) —
    // whichever came first establishes externalThreadId for everything
    // after it.
    const parent = await prisma.activity.findFirst({
      where: { caseId: data.caseId, id: { not: data.activityId }, externalMessageId: { not: null } },
      orderBy: { occurredAt: 'desc' },
    });
    const threadId = parent?.externalThreadId ?? parent?.externalMessageId ?? undefined;
    const messageId = `<${randomUUID()}@topiadesk.local>`;

    try {
      await sendMail({
        to,
        cc: cc.length > 0 ? cc : undefined,
        subject: activity.subject || `Re: ${kase.subject} [${kase.caseNumber}]`,
        text: activity.body ?? '',
        messageId,
        inReplyTo: parent?.externalMessageId ?? undefined,
        references: threadId,
      });
    } catch (err) {
      console.error(`[case-outbound-email] failed to send comment ${data.activityId} for case ${data.caseId}`, err);
      await prisma.activity.update({ where: { id: data.activityId }, data: { emailDeliveryStatus: 'FAILED', emailTo: to, emailCc: cc } });
      return { status: 'failed' };
    }

    await prisma.activity.update({
      where: { id: data.activityId },
      data: {
        emailDeliveryStatus: 'SENT',
        externalMessageId: messageId,
        externalThreadId: threadId ?? messageId,
        emailTo: to,
        emailCc: cc,
      },
    });
    return { status: 'sent' };
  });
}

export function createCaseOutboundEmailQueue(connection: Redis): Queue {
  return new Queue(CASE_OUTBOUND_EMAIL_QUEUE_NAME, { connection });
}

export function createCaseOutboundEmailWorker(connection: Redis): Worker {
  return new Worker(
    CASE_OUTBOUND_EMAIL_QUEUE_NAME,
    async (job: Job<SendCaseCommentEmailJobData>) => {
      const result = await sendCaseCommentEmail(job.data);
      console.log(`[case-outbound-email] activity ${job.data.activityId} case ${job.data.caseId}: ${result.status}`);
      return result;
    },
    { connection },
  );
}
