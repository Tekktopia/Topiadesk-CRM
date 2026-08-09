import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer side of "create an additional tenant admin" — same shape as
 * create-platform-admin-queue.ts, consumed by backend/worker's
 * create-tenant-admin Worker (backend/worker/src/jobs/platform/
 * create-tenant-admin.job.ts).
 */
const CREATE_TENANT_ADMIN_QUEUE_NAME = 'create-tenant-admin';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(CREATE_TENANT_ADMIN_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface CreateTenantAdminJobData {
  tenantId: string;
  email: string;
  fullName: string;
  /** When set, used as-is instead of generating + emailing a temporary
   * one — see tenant-user.dto.ts's CreateTenantAdminUserDto.password. */
  password?: string;
}

export async function enqueueCreateTenantAdmin(data: CreateTenantAdminJobData): Promise<void> {
  const q = getQueue();
  await q.add('create-tenant-admin', data, { removeOnComplete: true, removeOnFail: 100 });
}
