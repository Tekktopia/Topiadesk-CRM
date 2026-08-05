import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer-side handle onto the same BullMQ queue backend/worker's
 * generate-and-deliver.job.ts Worker consumes — mirrors
 * backend/api/src/modules/campaigns/campaign-dispatch-queue.ts exactly
 * (same producer/consumer split, same reasoning: api only ever adds jobs
 * here, never processes them). The queue name string is duplicated between
 * this file and backend/worker/src/jobs/scheduled-reports/
 * generate-and-deliver.job.ts — api and worker are independently
 * deployable apps with no shared package for BullMQ wiring specifically
 * (unlike the report registry itself, which DOES need a shared package —
 * see registry/report-definition.ts's comment for why that's different).
 * MUST stay 'scheduled-report-generate' in both, or run-now's enqueue
 * silently lands on a queue nothing consumes.
 */
export const SCHEDULED_REPORT_GENERATE_QUEUE_NAME = 'scheduled-report-generate';

export interface ScheduledReportGenerateJobData {
  runId: string;
}

let connection: Redis | undefined;
let queue: Queue<ScheduledReportGenerateJobData> | undefined;

function getConnection(): Redis {
  if (!connection) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

function getQueue(): Queue<ScheduledReportGenerateJobData> {
  if (!queue) queue = new Queue<ScheduledReportGenerateJobData>(SCHEDULED_REPORT_GENERATE_QUEUE_NAME, { connection: getConnection() });
  return queue;
}

/**
 * Enqueues an immediate generate-and-deliver attempt for one already-created
 * ScheduledReportRun — used by POST /scheduled-reports/:id/run-now. The
 * worker's dispatch.job.ts poll (~60s cadence) would eventually reach any
 * due report on its own; this exists purely to avoid that latency for an
 * explicit "run now" request, same tradeoff campaign-dispatch-queue.ts
 * documents for campaigns.
 */
export async function enqueueScheduledReportGenerate(runId: string): Promise<void> {
  await getQueue().add('generate', { runId }, { removeOnComplete: true, removeOnFail: 100 });
}
