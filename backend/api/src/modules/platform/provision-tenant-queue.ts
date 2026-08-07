import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer side of tenant provisioning — same producer/consumer split as
 * portal-login-queue.ts (api enqueues, backend/worker/src/jobs/platform/
 * provision-tenant.job.ts's Worker does the actual work: schema creation,
 * migrations, RLS, baseline seed, Keycloak realm + admin user, invite
 * email). Unlike portal-login-queue's fire-and-forget email send, a failed
 * enqueue here MUST fail the create-tenant request — an orphaned Tenant
 * row stuck at PROVISIONING forever with no job ever running is a worse
 * failure mode than a 500 the caller can retry.
 */
const PROVISION_TENANT_QUEUE_NAME = 'provision-tenant';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(PROVISION_TENANT_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface ProvisionTenantJobData {
  tenantId: string;
}

export async function enqueueTenantProvisioning(tenantId: string): Promise<void> {
  const q = getQueue();
  await q.add('provision-tenant', { tenantId } satisfies ProvisionTenantJobData, { removeOnComplete: true, removeOnFail: 100 });
}
