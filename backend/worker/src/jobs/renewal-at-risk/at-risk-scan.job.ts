/**
 * Auto-flips a RenewalSchedule from ON_TRACK to AT_RISK — today `status` is
 * entirely manual (PATCH .../renewal-schedule, a human picking a dropdown
 * value, see renewal-schedule.controller.ts), with nothing ever deriving it
 * automatically despite RenewalForecastPanel/getRenewalForecast already
 * weighting revenue BY that status. Heuristic: inside AT_RISK_WINDOW_DAYS of
 * renewalDueDate with no renewalMeetingDate booked yet — i.e. the clock is
 * running out and nothing shows the renewal is actually in motion. Not tied
 * to `alertThresholds` (that array governs when to REMIND someone, a
 * separate axis from whether the renewal is healthy).
 *
 * One-directional, same as SLA breach scan's RUNNING->BREACHED: this job
 * never reverts AT_RISK back to ON_TRACK even if a meeting later gets
 * booked — a human can always do that via the existing PATCH endpoint. Same
 * 15-minute Postgres-durable poll cadence and SYSTEM_JOB_CONTEXT as
 * renewal-scan.job.ts (a sibling job, not an extension of it — that job's
 * concern is reminder cadence, this one's is risk detection; keeping them
 * separate files keeps each's failure/retry story independent).
 *
 * Notify-then-flip ordering (not the reverse) is deliberate: if
 * Notification.create throws something other than the expected dedupe
 * collision, the status update is skipped too, so the schedule stays
 * ON_TRACK and is simply re-attempted on the next tick — no notification
 * ever gets silently lost behind an already-flipped status.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { daysBetween } from '../renewal-alerts/threshold';

export const RENEWAL_AT_RISK_SCAN_QUEUE_NAME = 'renewal-at-risk-scan';
const RENEWAL_AT_RISK_SCAN_SCHEDULER_ID = 'renewal-at-risk-scan-scheduler';
const RENEWAL_AT_RISK_SCAN_INTERVAL_MS = 15 * 60 * 1000;

const AT_RISK_WINDOW_DAYS = 30;

export interface RenewalAtRiskScanResult {
  flaggedCount: number;
  notificationsCreated: number;
  notificationsDeduped: number;
}

/** Exported standalone (not just wired as a BullMQ processor) — same reasoning as runRenewalScan: testable/manually-runnable without a Redis round trip, and RLS-protected tables need an explicit SYSTEM_JOB context for an org-wide scan. */
export async function runRenewalAtRiskScan(now: Date = new Date()): Promise<RenewalAtRiskScanResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const windowEnd = new Date(now.getTime() + AT_RISK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const candidates = await prisma.renewalSchedule.findMany({
      where: {
        status: 'ON_TRACK',
        renewalMeetingDate: null,
        renewalDueDate: { lte: windowEnd },
      },
      include: { policy: true },
    });

    let notificationsCreated = 0;
    let notificationsDeduped = 0;
    let flaggedCount = 0;

    for (const schedule of candidates) {
      const recipientUserId = schedule.assignedToId ?? schedule.policy.brokerOfRecordId;
      const daysUntilRenewal = daysBetween(now, schedule.renewalDueDate);

      if (recipientUserId) {
        try {
          await prisma.notification.create({
            data: {
              recipientUserId,
              type: 'RENEWAL_AT_RISK',
              title: `Policy ${schedule.policy.policyNumber} is now at risk`,
              body: `Policy ${schedule.policy.policyNumber} (${schedule.policy.lineOfBusiness}) renews in ${daysUntilRenewal} day(s) with no renewal meeting booked yet — flagged at risk.`,
              relatedEntityType: 'POLICY',
              relatedEntityId: schedule.policyId,
              channel: 'IN_APP',
              status: 'PENDING',
              // Stable, no date bucket — unlike renewal-scan's recurring
              // reminders, this is a one-time "status just changed" event
              // (the status filter above already stops re-selection once
              // flipped; this is the defense-in-depth layer for two worker
              // replicas racing on the same row, same as renewal-scan's).
              dedupeKey: `renewal-at-risk:${schedule.id}`,
            },
          });
          notificationsCreated++;
        } catch (err) {
          if (isUniqueConstraintViolation(err)) {
            notificationsDeduped++;
          } else {
            console.error(`[renewal-at-risk-scan] notification failed for schedule ${schedule.id} — leaving ON_TRACK for retry`, err);
            continue;
          }
        }
      } else {
        console.warn(`[renewal-at-risk-scan] schedule ${schedule.id} (policy ${schedule.policyId}) has no assignedToId or brokerOfRecordId — flagging AT_RISK without a notification`);
      }

      await prisma.renewalSchedule.update({ where: { id: schedule.id }, data: { status: 'AT_RISK' } });
      flaggedCount++;
    }

    return { flaggedCount, notificationsCreated, notificationsDeduped };
  });
}

/** Prisma surfaces a unique-constraint violation as PrismaClientKnownRequestError with code 'P2002'. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002';
}

export function createRenewalAtRiskScanQueue(connection: Redis): Queue {
  return new Queue(RENEWAL_AT_RISK_SCAN_QUEUE_NAME, { connection });
}

export function createRenewalAtRiskScanWorker(connection: Redis): Worker {
  return new Worker(
    RENEWAL_AT_RISK_SCAN_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runRenewalAtRiskScan();
      console.log(`[renewal-at-risk-scan] ${result.flaggedCount} flagged AT_RISK: ${result.notificationsCreated} notification(s) created, ${result.notificationsDeduped} deduped`);
      return result;
    },
    { connection },
  );
}

/** Registers the ~15-minute repeatable schedule. Safe on every worker boot — upsertJobScheduler is keyed by RENEWAL_AT_RISK_SCAN_SCHEDULER_ID, so a restart never produces a second overlapping schedule. */
export async function scheduleRenewalAtRiskScan(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(RENEWAL_AT_RISK_SCAN_SCHEDULER_ID, { every: RENEWAL_AT_RISK_SCAN_INTERVAL_MS }, { name: 'scan' });
}
