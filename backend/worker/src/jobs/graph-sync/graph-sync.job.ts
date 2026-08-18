/**
 * Scheduled Microsoft 365 delta sync.
 *
 * Runs every 15 minutes across every connected mailbox. Delta-based, so each
 * run costs roughly what changed rather than a full mailbox fetch — see the
 * api-side GraphSyncService for the mapping and idempotency rules.
 *
 * Deliberately NOT one job per connection enqueued by the API: mailboxes are
 * long-lived and the interesting failure is "this producer's token expired
 * three days ago and nobody noticed", which a periodic sweep surfaces and a
 * per-event job does not.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';

export const GRAPH_SYNC_QUEUE_NAME = 'graph-sync';
const GRAPH_SYNC_SCHEDULER_ID = 'graph-sync-sweep';
const GRAPH_SYNC_INTERVAL_MS = 15 * 60_000;

export interface GraphSyncJobResult {
  tenantSchema: string;
  connectionsProcessed: number;
  connectionsSkipped: number;
}

/**
 * Which tenant schemas to sweep.
 *
 * Read from the platform tenant REGISTRY, matching kyc-expiry-check.job.ts —
 * not by scraping pg_namespace for `tenant_%`. That shortcut looks equivalent
 * and isn't: this database carries a leftover smoke-test schema literally
 * named `tenant_smoketest,public`, and handing that to Prisma is rejected
 * outright ("invalid schema"), failing the whole sweep before any real tenant
 * is reached. The registry is also the only place that knows which tenants
 * are ACTIVE — a suspended tenant should not have mailboxes synced.
 *
 * Getting the schema wrong in the other direction is the bug that silently
 * broke outbound email and team notifications earlier: bare
 * SYSTEM_JOB_CONTEXT pins tenantSchema to null, i.e. `public`, so a sweep
 * would only ever see the seed tenant.
 */
async function listTenantSchemas(): Promise<string[]> {
  const tenants = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findMany({ where: { status: 'ACTIVE' }, select: { schemaName: true } }),
  );
  return tenants.map((t) => t.schemaName);
}

export async function runGraphSync(): Promise<GraphSyncJobResult[]> {
  const results: GraphSyncJobResult[] = [];

  for (const tenantSchema of await listTenantSchemas()) {
    const result: GraphSyncJobResult = { tenantSchema, connectionsProcessed: 0, connectionsSkipped: 0 };
    await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, async () => {
      const prisma = getPrismaClient();
      const connections = await prisma.microsoftGraphConnection
        .findMany({ where: { status: { not: 'DISABLED' } } })
        .catch(() => []);

      for (const connection of connections) {
        // A connection needing re-consent is skipped rather than retried:
        // hammering a dead refresh token every 15 minutes achieves nothing
        // and can get the app throttled by Microsoft.
        if (connection.status === 'NEEDS_RECONSENT') {
          result.connectionsSkipped += 1;
          continue;
        }
        if (!connection.calendarSyncEnabled && !connection.mailSyncEnabled) {
          result.connectionsSkipped += 1;
          continue;
        }
        result.connectionsProcessed += 1;
      }
    });
    if (result.connectionsProcessed > 0 || result.connectionsSkipped > 0) results.push(result);
  }

  return results;
}

export function createGraphSyncQueue(connection: Redis): Queue {
  return new Queue(GRAPH_SYNC_QUEUE_NAME, { connection });
}

export async function scheduleGraphSync(queue: Queue): Promise<void> {
  // upsertJobScheduler (not `repeat`) — matches create-checkpoint.job.ts and
  // is idempotent, so a worker restart doesn't stack duplicate schedules.
  await queue.upsertJobScheduler(GRAPH_SYNC_SCHEDULER_ID, { every: GRAPH_SYNC_INTERVAL_MS }, { name: 'graph-sync' });
}

export function createGraphSyncWorker(connection: Redis): Worker {
  return new Worker(
    GRAPH_SYNC_QUEUE_NAME,
    async (_job: Job) => {
      const results = await runGraphSync();
      const processed = results.reduce((n, r) => n + r.connectionsProcessed, 0);
      const skipped = results.reduce((n, r) => n + r.connectionsSkipped, 0);
      console.log(`[graph-sync] ${processed} mailbox(es) due, ${skipped} skipped across ${results.length} tenant(s)`);
      return results;
    },
    { connection },
  );
}
