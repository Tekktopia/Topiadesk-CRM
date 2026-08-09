import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer side of tenant-submitted support tickets — see this session's
 * plan's Decision 5 for why this is a queued job rather than a direct
 * write: keeps every write into `packages/db-platform` that originates
 * from a tenant-authenticated request running under SYSTEM_JOB_CONTEXT in
 * the worker, never under the tenant user's own ambient RlsContext.
 * Consumed by backend/worker/src/jobs/platform/create-support-ticket.job.ts.
 */
const CREATE_SUPPORT_TICKET_QUEUE_NAME = 'create-support-ticket';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(CREATE_SUPPORT_TICKET_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface CreateSupportTicketJobData {
  tenantSchema: string;
  subject: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  raisedByEmail: string;
  raisedByName: string;
}

export async function enqueueCreateSupportTicket(data: CreateSupportTicketJobData): Promise<void> {
  const q = getQueue();
  await q.add('create-support-ticket', data, { removeOnComplete: true, removeOnFail: 100 });
}
