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
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();

    const [activity, kase] = await Promise.all([
      prisma.activity.findUnique({ where: { id: data.activityId } }),
      prisma.case.findUnique({ where: { id: data.caseId } }),
    ]);
    if (!activity || !kase) return { status: 'skipped-not-found' };

    const email = await resolveCaseEmail(data.caseId);
    if (!email) {
      await prisma.activity.update({ where: { id: data.activityId }, data: { emailDeliveryStatus: 'SKIPPED_NO_EMAIL' } });
      return { status: 'skipped-no-email' };
    }

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
        to: email,
        subject: activity.subject || `Re: ${kase.subject} [${kase.caseNumber}]`,
        text: activity.body ?? '',
        messageId,
        inReplyTo: parent?.externalMessageId ?? undefined,
        references: threadId,
      });
    } catch (err) {
      console.error(`[case-outbound-email] failed to send comment ${data.activityId} for case ${data.caseId}`, err);
      await prisma.activity.update({ where: { id: data.activityId }, data: { emailDeliveryStatus: 'FAILED' } });
      return { status: 'failed' };
    }

    await prisma.activity.update({
      where: { id: data.activityId },
      data: {
        emailDeliveryStatus: 'SENT',
        externalMessageId: messageId,
        externalThreadId: threadId ?? messageId,
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
