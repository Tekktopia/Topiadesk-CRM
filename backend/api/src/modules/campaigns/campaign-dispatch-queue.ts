import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer-side handle onto the same BullMQ queue backend/worker's
 * dispatch.job.ts consumes — api only ever adds jobs here, never processes
 * them (no Worker instance in this process), the standard BullMQ producer/
 * consumer split. The queue name string is duplicated between the two
 * files (api and worker are independently deployable apps with no shared
 * package for this, same reasoning as segment-filters.ts) — MUST stay
 * 'campaign-dispatch' in both, or api's enqueue silently lands on a queue
 * nothing consumes.
 */
export const CAMPAIGN_DISPATCH_QUEUE_NAME = 'campaign-dispatch';

export interface CampaignDispatchJobData {
  campaignId: string;
}

let connection: Redis | undefined;
let queue: Queue<CampaignDispatchJobData> | undefined;

function getConnection(): Redis {
  if (!connection) {
    const env = loadEnv();
    // maxRetriesPerRequest: null — required by BullMQ's Queue client too
    // (not just Worker's blocking commands); see worker/src/main.ts's
    // identical setting for why omitting it surfaces as jobs silently
    // never being added/picked up rather than a clear error.
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

function getQueue(): Queue<CampaignDispatchJobData> {
  if (!queue) queue = new Queue<CampaignDispatchJobData>(CAMPAIGN_DISPATCH_QUEUE_NAME, { connection: getConnection() });
  return queue;
}

/**
 * Enqueues an immediate dispatch attempt for one campaign — used by
 * POST /campaigns/:id/send, /resume, and the A/B test decide-winner
 * endpoint. The worker's repeatable poll would eventually reach the same
 * campaign on its own (~60s cadence); this exists purely to avoid that
 * latency for an explicit "act now" request.
 */
export async function enqueueCampaignDispatch(campaignId: string): Promise<void> {
  await getQueue().add('dispatch', { campaignId }, { removeOnComplete: true, removeOnFail: 100 });
}
