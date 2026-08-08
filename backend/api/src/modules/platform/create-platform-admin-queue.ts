import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer side of platform-admin account creation — same producer/consumer
 * split as provision-tenant-queue.ts, but a single-step job (backend/worker's
 * create-platform-admin Worker at backend/worker/src/jobs/platform/
 * create-platform-admin.job.ts does the Keycloak user + PlatformAdminUser
 * row + invite email, no multi-step timeline needed).
 */
const CREATE_PLATFORM_ADMIN_QUEUE_NAME = 'create-platform-admin';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(CREATE_PLATFORM_ADMIN_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface CreatePlatformAdminJobData {
  email: string;
  fullName: string;
}

export async function enqueueCreatePlatformAdmin(data: CreatePlatformAdminJobData): Promise<void> {
  const q = getQueue();
  await q.add('create-platform-admin', data, { removeOnComplete: true, removeOnFail: 100 });
}
