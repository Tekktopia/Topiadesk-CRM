/**
 * Outbound webhook dispatch — two Postgres-durable responsibilities per
 * tick, same philosophy as renewal-scan.job.ts's own header comment (a
 * Redis/BullMQ outage must never silently drop a webhook; the next tick
 * just re-derives what's due from the database):
 *
 *  1. Poll `audit_log` by an incrementing cursor (stored in OrgSetting,
 *     key 'webhooks.audit_log_cursor' — a small dedicated table was the
 *     other documented option, OrgSetting was chosen since this is exactly
 *     the kind of small piece of durable app state it already exists for,
 *     and it comes with an RLS-free admin-visible key/value surface for
 *     free instead of a new table nobody else needs). Maps
 *     (entity_type, action, changed_fields) -> WebhookEventType via the
 *     explicit lookup table in audit-event-map.ts, and creates one
 *     WebhookDelivery row (status PENDING) per (matching active
 *     subscription, event).
 *  2. Sweeps WebhookDelivery rows with status='PENDING' AND attemptCount=0
 *     AND nextAttemptAt <= now, and enqueues exactly one BullMQ job per
 *     row. attemptCount=0 is what makes this safe to re-run every tick
 *     without double-enqueuing: once a delivery's first attempt starts,
 *     the processor bumps attemptCount immediately, so it drops out of
 *     this sweep — retries after that are BullMQ's own attempts/backoff
 *     mechanism re-invoking the SAME job, not a second sweep pass. This is
 *     also how a manual redeliver (webhook-subscriptions.controller.ts's
 *     POST .../redeliver, which just resets attemptCount to 0 and
 *     nextAttemptAt to now) re-enters the dispatch pipeline — no direct
 *     Queue access needed from the API process.
 */
import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
import { mapAuditRowToWebhookEventType } from './audit-event-map';
import { signWebhookPayload } from './webhook-signing.util';

export const WEBHOOK_POLL_QUEUE_NAME = 'webhook-poll';
export const WEBHOOK_DISPATCH_QUEUE_NAME = 'webhook-dispatch';
const POLL_SCHEDULER_ID = 'webhook-poll-scheduler';
const POLL_INTERVAL_MS = 60 * 1000;
const CURSOR_SETTING_KEY = 'webhooks.audit_log_cursor';
const AUDIT_LOG_BATCH_SIZE = 500;
const DUE_DELIVERY_SWEEP_LIMIT = 500;
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_DELAY_MS = 60_000; // 1min, 2min, 4min, 8min, 16min, 32min — same order of magnitude as Stripe's own webhook retry cadence
const REQUEST_TIMEOUT_MS = 10_000;

export interface WebhookPollResult {
  auditRowsScanned: number;
  deliveriesCreated: number;
  deliveriesEnqueued: number;
}

/** `dispatchQueue` is threaded in explicitly (not a module-level singleton) — see createWebhookPollWorker(), which closes over it. */
export async function runWebhookPoll(dispatchQueue: Queue, now: Date = new Date()): Promise<WebhookPollResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const { auditRowsScanned, deliveriesCreated } = await scanNewAuditRows(prisma, now);
    const deliveriesEnqueued = await sweepDueDeliveries(prisma, dispatchQueue, now);
    return { auditRowsScanned, deliveriesCreated, deliveriesEnqueued };
  });
}

async function scanNewAuditRows(
  prisma: ReturnType<typeof getPrismaClient>,
  now: Date,
): Promise<{ auditRowsScanned: number; deliveriesCreated: number }> {
  const activeSubscriptions = await prisma.webhookSubscription.findMany({ where: { isActive: true } });
  if (activeSubscriptions.length === 0) return { auditRowsScanned: 0, deliveriesCreated: 0 };

  const cursorSetting = await prisma.orgSetting.findUnique({ where: { key: CURSOR_SETTING_KEY } });
  const cursorValue = cursorSetting?.value as { lastProcessedId?: string } | null;
  let cursorId = cursorValue?.lastProcessedId ? BigInt(cursorValue.lastProcessedId) : BigInt(0);

  let auditRowsScanned = 0;
  let deliveriesCreated = 0;

  for (;;) {
    const rows = await prisma.auditLog.findMany({ where: { id: { gt: cursorId } }, orderBy: { id: 'asc' }, take: AUDIT_LOG_BATCH_SIZE });
    if (rows.length === 0) break;
    auditRowsScanned += rows.length;

    for (const row of rows) {
      const eventType = mapAuditRowToWebhookEventType(
        row.entityType,
        row.action,
        row.changedFields as Record<string, { old?: unknown; new?: unknown }> | null,
      );
      if (eventType) {
        for (const sub of activeSubscriptions) {
          if (!sub.eventTypes.includes(eventType)) continue;
          try {
            await prisma.webhookDelivery.create({
              data: {
                subscriptionId: sub.id,
                eventType,
                payload: {
                  entityType: row.entityType,
                  entityId: row.entityId,
                  action: row.action,
                  auditLogId: row.id.toString(),
                  occurredAt: row.createdAt.toISOString(),
                } satisfies Prisma.InputJsonValue,
                status: 'PENDING',
                nextAttemptAt: now,
                correlationId: randomUUID(),
              },
            });
            deliveriesCreated++;
          } catch (err) {
            console.error(`[webhook-dispatch] failed to create delivery for subscription ${sub.id}, audit_log ${row.id}:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }

    cursorId = rows[rows.length - 1]!.id;
    if (rows.length < AUDIT_LOG_BATCH_SIZE) break;
  }

  await prisma.orgSetting.upsert({
    where: { key: CURSOR_SETTING_KEY },
    update: { value: { lastProcessedId: cursorId.toString() } },
    create: { key: CURSOR_SETTING_KEY, value: { lastProcessedId: cursorId.toString() } },
  });

  return { auditRowsScanned, deliveriesCreated };
}

async function sweepDueDeliveries(prisma: ReturnType<typeof getPrismaClient>, dispatchQueue: Queue, now: Date): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'PENDING', attemptCount: 0, nextAttemptAt: { lte: now } },
    take: DUE_DELIVERY_SWEEP_LIMIT,
  });
  if (due.length === 0) return 0;

  let enqueued = 0;
  for (const delivery of due) {
    // jobId keyed on (delivery id, attemptCount=0) — Queue.add() with an
    // already-existing, not-yet-completed jobId is a safe no-op, so
    // re-running this sweep before BullMQ has picked the job up can't
    // double-enqueue the same attempt (same idempotency reasoning as
    // renewal-scan.job.ts's upsertJobScheduler comment).
    await dispatchQueue.add(
      'deliver',
      { deliveryId: delivery.id },
      {
        jobId: `${delivery.id}:0`,
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BASE_BACKOFF_DELAY_MS },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    enqueued++;
  }
  return enqueued;
}

async function processDeliveryJob(job: Job<{ deliveryId: string }>): Promise<void> {
  await runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const delivery = await prisma.webhookDelivery.findUnique({ where: { id: job.data.deliveryId }, include: { subscription: true } });
    if (!delivery) {
      console.warn(`[webhook-dispatch] delivery ${job.data.deliveryId} no longer exists — skipping`);
      return;
    }
    if (!delivery.subscription.isActive) {
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', lastAttemptAt: new Date(), nextAttemptAt: null } });
      return; // not thrown — an intentionally-disabled subscription shouldn't keep retrying
    }

    const rawBody = JSON.stringify(delivery.payload);
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(delivery.subscription.signingSecret, rawBody, timestampSeconds);

    // BullMQ's `attemptsMade` is incremented AFTER a job settles (see
    // job.js's moveToCompleted/moveToFailed), so it reflects PRIOR
    // completed attempts while this one is in flight — +1 is this attempt's
    // own 1-indexed number. Verified against bullmq@6.0.5's own source
    // (shouldRetryJob's `attemptsMade + 1 < opts.attempts` check) rather
    // than assumed, since an off-by-one here would mean either retrying one
    // time too many or marking EXHAUSTED one attempt too early.
    const attemptNumber = job.attemptsMade + 1;
    const isFinalAttempt = attemptNumber >= (job.opts.attempts ?? MAX_ATTEMPTS);

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        response = await fetch(delivery.subscription.targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TopiaDesk-Signature': signature, 'X-TopiaDesk-Event': delivery.eventType },
          body: rawBody,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      await recordAttemptOutcome(prisma, delivery.id, attemptNumber, isFinalAttempt, null, err instanceof Error ? err.message : String(err));
      throw err; // rethrow so BullMQ's attempts/backoff actually retries
    }

    const bodySnippet = (await response.text().catch(() => '')).slice(0, 1000);

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SUCCEEDED', attemptCount: attemptNumber, lastAttemptAt: new Date(), nextAttemptAt: null, responseStatus: response.status, responseBodySnippet: bodySnippet },
      });
      return;
    }

    await recordAttemptOutcome(prisma, delivery.id, attemptNumber, isFinalAttempt, response.status, bodySnippet);
    throw new Error(`Webhook target responded ${response.status}`);
  });
}

async function recordAttemptOutcome(
  prisma: ReturnType<typeof getPrismaClient>,
  deliveryId: string,
  attemptNumber: number,
  isFinalAttempt: boolean,
  responseStatus: number | null,
  responseBodySnippet: string | null,
): Promise<void> {
  // Approximates BullMQ's own exponential-backoff formula for DISPLAY
  // purposes only (the admin API's delivery list) — BullMQ's internal
  // Redis-side timer is the actual authority on when the retry fires.
  const nextAttemptAt = isFinalAttempt ? null : new Date(Date.now() + BASE_BACKOFF_DELAY_MS * 2 ** (attemptNumber - 1));
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: isFinalAttempt ? 'EXHAUSTED' : 'FAILED',
      attemptCount: attemptNumber,
      lastAttemptAt: new Date(),
      nextAttemptAt,
      responseStatus,
      responseBodySnippet,
    },
  });
}

export function createWebhookDispatchQueue(connection: Redis): Queue {
  return new Queue(WEBHOOK_DISPATCH_QUEUE_NAME, { connection });
}

export function createWebhookDispatchWorker(connection: Redis): Worker {
  return new Worker(WEBHOOK_DISPATCH_QUEUE_NAME, (job: Job<{ deliveryId: string }>) => processDeliveryJob(job), { connection });
}

export function createWebhookPollQueue(connection: Redis): Queue {
  return new Queue(WEBHOOK_POLL_QUEUE_NAME, { connection });
}

/** `dispatchQueue` must already exist (see createWebhookDispatchQueue) — this worker enqueues INTO it on every poll tick. */
export function createWebhookPollWorker(connection: Redis, dispatchQueue: Queue): Worker {
  return new Worker(
    WEBHOOK_POLL_QUEUE_NAME,
    async () => {
      const result = await runWebhookPoll(dispatchQueue);
      console.log(
        `[webhook-poll] scanned ${result.auditRowsScanned} audit row(s), created ${result.deliveriesCreated} delivery(ies), enqueued ${result.deliveriesEnqueued}`,
      );
      return result;
    },
    { connection },
  );
}

export async function scheduleWebhookPoll(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(POLL_SCHEDULER_ID, { every: POLL_INTERVAL_MS }, { name: 'poll' });
}
