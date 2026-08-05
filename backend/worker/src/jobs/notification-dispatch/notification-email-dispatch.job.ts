/**
 * Notification.channel has always supported EMAIL/SMS, but until now
 * nothing ever actually sent one — every existing Notification-creating
 * call site (sla-breach-scan, automation SEND_NOTIFICATION action, etc.)
 * only ever created channel:'IN_APP' rows, so the gap was invisible. This
 * is the first real dispatcher for the EMAIL channel; SMS is deliberately
 * left alone (needs a real SMS provider/credentials this codebase doesn't
 * have — a separate future pass, not this one).
 *
 * Polling worker job, not an inline send at Notification-creation time —
 * an SMTP hiccup must never block/fail the primary request-handling
 * transaction that created the Notification row. Structurally the same
 * poll-a-PENDING-column shape as ../sla-breach-scan/breach-scan.job.ts and
 * ../renewal-alerts/renewal-scan.job.ts (read those first).
 *
 * Idempotency is a claim-then-send pattern, not dedupeKey (dedupeKey
 * already solved *row* dedup at creation time — this solves *send* dedup
 * for an already-created row): `UPDATE ... WHERE status = 'PENDING'`
 * atomically claims the row before sending, so two ticks (or two worker
 * replicas) racing on the same row can't both send the same email — only
 * the one whose updateMany actually matched a row proceeds to send.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { sendMail } from '../scheduled-reports/mailer';

export const NOTIFICATION_EMAIL_DISPATCH_QUEUE_NAME = 'notification-email-dispatch';
const NOTIFICATION_EMAIL_DISPATCH_SCHEDULER_ID = 'notification-email-dispatch-scheduler';
const NOTIFICATION_EMAIL_DISPATCH_INTERVAL_MS = 3 * 60 * 1000;
const BATCH_SIZE = 50;

export interface NotificationEmailDispatchResult {
  sent: number;
  failed: number;
  skippedAlreadyClaimed: number;
}

export async function runNotificationEmailDispatch(): Promise<NotificationEmailDispatchResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const result: NotificationEmailDispatchResult = { sent: 0, failed: 0, skippedAlreadyClaimed: 0 };

    const pending = await prisma.notification.findMany({
      where: { channel: 'EMAIL', status: 'PENDING' },
      include: { recipient: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const notification of pending) {
      const claim = await prisma.notification.updateMany({
        where: { id: notification.id, status: 'PENDING' },
        data: { status: 'SENT', sentAt: new Date() },
      });
      if (claim.count === 0) {
        result.skippedAlreadyClaimed++;
        continue;
      }

      try {
        await sendMail({ to: notification.recipient.email, subject: notification.title, text: notification.body });
        result.sent++;
      } catch (err) {
        console.error(`[notification-email-dispatch] failed to send notification ${notification.id}`, err);
        await prisma.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
        result.failed++;
      }
    }

    return result;
  });
}

export function createNotificationEmailDispatchQueue(connection: Redis): Queue {
  return new Queue(NOTIFICATION_EMAIL_DISPATCH_QUEUE_NAME, { connection });
}

export function createNotificationEmailDispatchWorker(connection: Redis): Worker {
  return new Worker(
    NOTIFICATION_EMAIL_DISPATCH_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runNotificationEmailDispatch();
      console.log(
        `[notification-email-dispatch] ${result.sent} sent, ${result.failed} failed, ${result.skippedAlreadyClaimed} already claimed`,
      );
      return result;
    },
    { connection },
  );
}

/** Safe to call on every worker boot — upsertJobScheduler is idempotent by scheduler id, same boot-safe pattern as scheduleSlaBreachScan. */
export async function scheduleNotificationEmailDispatch(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(NOTIFICATION_EMAIL_DISPATCH_SCHEDULER_ID, { every: NOTIFICATION_EMAIL_DISPATCH_INTERVAL_MS }, { name: 'dispatch' });
}
