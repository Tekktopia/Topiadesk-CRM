/**
 * Postgres-durable poll for scheduled report delivery — mirrors
 * renewal-alerts/renewal-scan.job.ts's exact shape (polls a `next*At`
 * column rather than scheduling far in advance in Redis, so a Redis
 * restart can never silently drop a due report). Two-stage pipeline,
 * unlike renewal-scan's single stage: this job only decides WHAT is due
 * and advances the schedule; actually running the report and delivering it
 * is generate-and-deliver.job.ts's Worker, consuming a job this one
 * enqueues per due ScheduledReport. Same split
 * backend/api/src/modules/campaigns/campaign-dispatch-queue.ts's producer
 * pairs with on the campaigns side, and the same reason: run-now (see
 * scheduled-reports.controller.ts) enqueues directly onto the SAME
 * generate queue for immediate turnaround, while this poll is what
 * guarantees a due report is never silently missed even if that direct
 * enqueue never happened (worker restart, API instance briefly down, etc).
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { computeNextRunAt } from '@topiadesk/reports';
import { SCHEDULED_REPORT_GENERATE_QUEUE_NAME } from './generate-and-deliver.job';

export const SCHEDULED_REPORT_DISPATCH_QUEUE_NAME = 'scheduled-report-dispatch';
const SCHEDULED_REPORT_DISPATCH_SCHEDULER_ID = 'scheduled-report-dispatch-scheduler';
// Reports are more time-sensitive than renewal alerts from a "did my
// run-now actually run now" UX standpoint, but still a background poll —
// 60s matches campaign-dispatch's own poll cadence (see that job's
// comment) rather than renewal-scan's 15 minutes.
const SCHEDULED_REPORT_DISPATCH_INTERVAL_MS = 60 * 1000;

export interface ScheduledReportDispatchResult {
  dueCount: number;
  enqueuedCount: number;
}

export async function runScheduledReportDispatch(
  generateQueue: Queue,
  now: Date = new Date(),
): Promise<ScheduledReportDispatchResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const dueReports = await prisma.scheduledReport.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
    });

    let enqueuedCount = 0;
    for (const report of dueReports) {
      const run = await prisma.scheduledReportRun.create({
        data: {
          scheduledReportId: report.id,
          reportKey: report.reportKey,
          filters: report.filters as object,
          dimension: report.dimension,
          format: report.format,
          status: 'PENDING',
        },
      });

      const nextRunAt = computeNextRunAt(report.frequency, report.dayOfWeek, report.dayOfMonth, report.hourOfDayUtc, now);
      await prisma.scheduledReport.update({
        where: { id: report.id },
        data: { lastRunAt: now, nextRunAt },
      });

      await generateQueue.add('generate', { runId: run.id }, { removeOnComplete: true, removeOnFail: 100 });
      enqueuedCount++;
    }

    return { dueCount: dueReports.length, enqueuedCount };
  });
}

export function createScheduledReportDispatchQueue(connection: Redis): Queue {
  return new Queue(SCHEDULED_REPORT_DISPATCH_QUEUE_NAME, { connection });
}

/** `generateQueue` is passed in (not created internally) so jobs/index.ts owns the single Queue instance and can close it on shutdown alongside every other registered queue. */
export function createScheduledReportDispatchWorker(connection: Redis, generateQueue: Queue): Worker {
  return new Worker(
    SCHEDULED_REPORT_DISPATCH_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runScheduledReportDispatch(generateQueue);
      if (result.dueCount > 0) {
        console.log(
          `[scheduled-report-dispatch] ${result.dueCount} due report(s), enqueued ${result.enqueuedCount} onto ${SCHEDULED_REPORT_GENERATE_QUEUE_NAME}`,
        );
      }
      return result;
    },
    { connection },
  );
}

export async function scheduleScheduledReportDispatch(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SCHEDULED_REPORT_DISPATCH_SCHEDULER_ID, { every: SCHEDULED_REPORT_DISPATCH_INTERVAL_MS }, { name: 'dispatch' });
}
