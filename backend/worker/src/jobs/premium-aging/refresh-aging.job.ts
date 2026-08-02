/**
 * Refreshes `premium_aging_summary` (see prisma/rls/004_reporting_views.sql
 * — aging can't be a Prisma generated column since CURRENT_DATE isn't
 * IMMUTABLE, so it's a materialized view refreshed on a schedule instead).
 * Deliberately its own queue/schedule, separate from the renewal-alert scan
 * — an hourly cadence is plenty for aging buckets and bolting it onto the
 * 15-minute renewal scan would just make that job's failure mode blast
 * radius bigger for no benefit.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { executeRawWithRlsContext } from '../../rls-raw-query.util';

export const PREMIUM_AGING_REFRESH_QUEUE_NAME = 'premium-aging-refresh';
const PREMIUM_AGING_REFRESH_SCHEDULER_ID = 'premium-aging-refresh-scheduler';
const PREMIUM_AGING_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export async function runPremiumAgingRefresh(): Promise<void> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => executeRawWithRlsContext('SELECT refresh_premium_aging_summary()'));
}

export function createPremiumAgingRefreshQueue(connection: Redis): Queue {
  return new Queue(PREMIUM_AGING_REFRESH_QUEUE_NAME, { connection });
}

export function createPremiumAgingRefreshWorker(connection: Redis): Worker {
  return new Worker(
    PREMIUM_AGING_REFRESH_QUEUE_NAME,
    async (_job: Job) => {
      await runPremiumAgingRefresh();
      console.log('[premium-aging-refresh] premium_aging_summary refreshed');
    },
    { connection },
  );
}

/** Idempotent — see renewal-scan.job.ts's scheduleRenewalScan comment; same reasoning applies here. */
export async function schedulePremiumAgingRefresh(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(PREMIUM_AGING_REFRESH_SCHEDULER_ID, { every: PREMIUM_AGING_REFRESH_INTERVAL_MS }, { name: 'refresh' });
}
