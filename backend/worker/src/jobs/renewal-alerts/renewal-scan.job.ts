/**
 * The renewal-alert scan — see docs/architecture.md / the Phase 1 build
 * plan's "Production-hardening mechanisms" #3 for why this is
 * Postgres-durable (polls RenewalSchedule.nextAlertDueAt) rather than
 * scheduled far in advance in Redis: a Redis restart can never silently
 * drop a reminder, because the next scan tick just re-derives what's due
 * from the database.
 *
 * Idempotency (the entire point of this job) has two independent layers:
 *  1. DB-level, load-bearing: Notification.dedupeKey's unique constraint.
 *     A P2002 on create is caught below as a no-op, not a job failure.
 *  2. Queue-level, defense in depth: the repeatable schedule is registered
 *     via `upsertJobScheduler`, which is idempotent by scheduler id and
 *     assigns each tick a BullMQ-internal deterministic job id of the form
 *     `repeat:<schedulerId>:<nextMillis>` — see bullmq's
 *     JobScheduler.getSchedulerNextJobId. Re-registering on every worker
 *     boot can't create overlapping schedules, and BullMQ itself can't
 *     double-enqueue the same tick.
 * Layer 1 is what's actually verified in test/renewal-alert.integration.test.ts
 * — the queue can duplicate-enqueue in ways layer 2 doesn't fully prevent
 * (e.g. two worker replicas both polling), and correctness must not depend
 * on the queue behaving perfectly.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { applicableThreshold, dateBucket, daysBetween, nextAlertDate } from './threshold';

export const RENEWAL_SCAN_QUEUE_NAME = 'renewal-scan';
const RENEWAL_SCAN_SCHEDULER_ID = 'renewal-scan-scheduler';
const RENEWAL_SCAN_INTERVAL_MS = 15 * 60 * 1000;

// Once a RenewalSchedule reaches one of these, there's nothing left to
// remind anyone about — excluded from the scan so it isn't re-selected
// forever after the smallest threshold's fallback (see threshold.ts's
// nextAlertDate returning null -> "check again tomorrow").
const TERMINAL_RENEWAL_STATUSES = ['RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'] as const;

export interface RenewalScanResult {
  scheduleCount: number;
  notificationsCreated: number;
  notificationsDeduped: number;
}

/**
 * Exported standalone (not just wired as a BullMQ processor) so it can be
 * invoked directly — from an integration test, or a one-off manual run —
 * without a Redis round trip. Always runs under SYSTEM_JOB: a background
 * scan needs to see every org-wide RenewalSchedule, not whatever a
 * request-scoped user could see, and without a bound RLS context
 * RLS-protected tables fail closed (zero rows), not open.
 */
export async function runRenewalScan(now: Date = new Date()): Promise<RenewalScanResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const dueSchedules = await prisma.renewalSchedule.findMany({
      where: {
        nextAlertDueAt: { lte: now },
        status: { notIn: [...TERMINAL_RENEWAL_STATUSES] },
      },
      include: { policy: true },
    });

    let notificationsCreated = 0;
    let notificationsDeduped = 0;

    for (const schedule of dueSchedules) {
      const recipientUserId = schedule.assignedToId ?? schedule.policy.brokerOfRecordId;
      const daysUntilRenewal = daysBetween(now, schedule.renewalDueDate);
      const threshold = applicableThreshold(schedule.alertThresholds, daysUntilRenewal);
      const dedupeKey = `renewal-alert:${schedule.policyId}:${threshold}:${dateBucket(now)}`;

      if (!recipientUserId) {
        // Nobody to notify — still advance the schedule below so an
        // unassigned renewal doesn't spin the scan every 15 minutes forever.
        console.warn(
          `[renewal-scan] schedule ${schedule.id} (policy ${schedule.policyId}) has no assignedToId or brokerOfRecordId — skipping notification, advancing schedule anyway`,
        );
      } else {
        try {
          await prisma.notification.create({
            data: {
              recipientUserId,
              type: 'RENEWAL_ALERT',
              title: `Policy ${schedule.policy.policyNumber} renews in ${threshold} day(s)`,
              body: `Policy ${schedule.policy.policyNumber} (${schedule.policy.lineOfBusiness}) is due for renewal on ${schedule.renewalDueDate.toISOString().slice(0, 10)} — ${daysUntilRenewal} day(s) from now, crossing the ${threshold}-day alert threshold.`,
              relatedEntityType: 'POLICY',
              relatedEntityId: schedule.policyId,
              channel: 'IN_APP',
              status: 'PENDING',
              dedupeKey,
            },
          });
          notificationsCreated++;
        } catch (err) {
          if (isUniqueConstraintViolation(err)) {
            notificationsDeduped++;
          } else {
            throw err;
          }
        }
      }

      const next = nextAlertDate(schedule.renewalDueDate, schedule.alertThresholds, threshold);
      await prisma.renewalSchedule.update({
        where: { id: schedule.id },
        data: {
          lastAlertSentAt: now,
          nextAlertDueAt: next ?? new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return { scheduleCount: dueSchedules.length, notificationsCreated, notificationsDeduped };
  });
}

/** Prisma surfaces a unique-constraint violation as PrismaClientKnownRequestError with code 'P2002'. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002';
}

export function createRenewalScanQueue(connection: Redis): Queue {
  return new Queue(RENEWAL_SCAN_QUEUE_NAME, { connection });
}

export function createRenewalScanWorker(connection: Redis): Worker {
  return new Worker(
    RENEWAL_SCAN_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runRenewalScan();
      console.log(
        `[renewal-scan] ${result.scheduleCount} due schedule(s): ${result.notificationsCreated} notification(s) created, ${result.notificationsDeduped} deduped`,
      );
      return result;
    },
    { connection },
  );
}

/**
 * Registers the ~15-minute repeatable schedule. Safe to call on every
 * worker boot — `upsertJobScheduler` is an upsert keyed by
 * RENEWAL_SCAN_SCHEDULER_ID, so a restart never produces a second
 * overlapping schedule.
 */
export async function scheduleRenewalScan(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(RENEWAL_SCAN_SCHEDULER_ID, { every: RENEWAL_SCAN_INTERVAL_MS }, { name: 'scan' });
}
