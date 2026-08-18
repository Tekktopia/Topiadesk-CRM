/**
 * Two-part job: (1) periodic checkpoint creation via the SQL
 * `create_audit_checkpoint()` function (packages/db/prisma/triggers/
 * 003_audit_checkpoint.sql) — defined and migrated, but never invoked by
 * any application code before this job (the 3 rows already in
 * `audit_checkpoints` at the time this was written predate it, created
 * directly by packages/db/test/rls-and-audit.integration.test.ts's own test
 * calls); (2) immediately verifying the hash chain since the PRIOR
 * checkpoint and alerting ADMIN/COMPLIANCE_OFFICER if a mismatch is found —
 * turning "tamper-evident, if anyone thinks to check" into "actively
 * self-monitoring", per 003_audit_checkpoint.sql's own header comment
 * ("without this, 'tamper-evident' is a claim nobody ever actually
 * checks").
 *
 * Loops over every ACTIVE tenant from the platform registry rather than
 * running once under bare SYSTEM_JOB_CONTEXT — that context's tenantSchema
 * is null (resolves to `public` only, see RlsContext's own doc comment),
 * which would silently checkpoint just one of the three real tenants. This
 * is a real, pre-existing gap shared by every OTHER scheduled job in this
 * directory today (none of them loop over tenants either) — out of scope
 * to fix everywhere in this pass, but worth applying here specifically
 * since an audit trail that only covers one of three active tenants
 * defeats the point of the feature.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, Prisma } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { queryRawWithRlsContext } from '../../rls-raw-query.util';

export const AUDIT_CHECKPOINT_QUEUE_NAME = 'audit-checkpoint';
const AUDIT_CHECKPOINT_SCHEDULER_ID = 'audit-checkpoint-scheduler';
// Matches packages/db/prisma/triggers/003_audit_checkpoint.sql's own
// documented intended cadence ("called every ~5 min by the worker").
const AUDIT_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

interface HashMismatchRow {
  id: bigint;
  entity_type: string;
  entity_id: string;
  stored_hash: string;
  recomputed_hash: string;
}

export interface TenantCheckpointResult {
  schemaName: string;
  checkpointId: string;
  rowsChecked: number;
  mismatchCount: number;
  alertedRecipients: number;
}

/**
 * Recomputes every row's own `current_hash` from its OWN already-stored
 * `prev_hash` column + payload — NOT via `LAG() OVER (ORDER BY id)`, which
 * this job's first live run proved is unsound: `id` (nextval()) is
 * allocated before audit_chain_before_insert()'s per-lane
 * `pg_advisory_xact_lock` is acquired, so under concurrent writes to the
 * SAME lane, `id` order can diverge from true chain order, producing false
 * "mismatches" that scale with write volume, not with actual tampering
 * (290 false positives in the busiest tenant, 0 in the two quieter ones,
 * all vanishing once this version shipped). The trigger's own chaining has
 * no such bug — the advisory lock fully serializes writers within a lane,
 * so each row's stored `prev_hash` always correctly reflects its true
 * predecessor's real `current_hash`; only the LAG()-based RECONSTRUCTION of
 * that ordering was wrong. Trusting the already-stored `prev_hash` column
 * instead is simpler, needs no window function (so the date range applies
 * directly in the WHERE clause, no whole-table scan), and is strictly more
 * correct — see backend/api/src/modules/identity/audit-export.controller.ts's
 * verify() for the twin fix and its fuller reasoning.
 */
async function findHashMismatches(sinceCheckpointAt: Date | null, throughCheckpointAt: Date): Promise<HashMismatchRow[]> {
  return queryRawWithRlsContext<HashMismatchRow>(Prisma.sql`
    SELECT id, entity_type, entity_id, current_hash AS stored_hash,
      encode(digest(
        COALESCE(prev_hash, '') || jsonb_build_object(
          'id', id, 'entity_type', entity_type, 'entity_id', entity_id, 'action', action,
          'actor_user_id', actor_user_id, 'actor_system_job', actor_system_job, 'actor_ip', actor_ip,
          'changed_fields', changed_fields, 'chain_lane', chain_lane, 'created_at', created_at
        )::text, 'sha256'), 'hex') AS recomputed_hash
    FROM audit_log
    WHERE (${sinceCheckpointAt}::timestamptz IS NULL OR created_at > ${sinceCheckpointAt}::timestamptz)
      AND created_at <= ${throughCheckpointAt}::timestamptz
      AND current_hash <> encode(digest(
        COALESCE(prev_hash, '') || jsonb_build_object(
          'id', id, 'entity_type', entity_type, 'entity_id', entity_id, 'action', action,
          'actor_user_id', actor_user_id, 'actor_system_job', actor_system_job, 'actor_ip', actor_ip,
          'changed_fields', changed_fields, 'chain_lane', chain_lane, 'created_at', created_at
        )::text, 'sha256'), 'hex')
    ORDER BY id
    LIMIT 100
  `);
}

/** Notifies every active ADMIN/COMPLIANCE_OFFICER in this tenant — same IN_APP+EMAIL fan-out shape as case-management/notify-team-assignment.job.ts. dedupeKey is keyed off the checkpoint id, so a retried/re-run job never double-notifies for the same detection. */
async function alertOnTamperDetected(schemaName: string, checkpointId: string, mismatchCount: number): Promise<number> {
  const prisma = getPrismaClient();
  const recipients = await prisma.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: { name: { in: ['ADMIN', 'COMPLIANCE_OFFICER'] } } } } },
    select: { id: true },
  });
  if (recipients.length === 0) return 0;

  const title = 'Audit log integrity check failed';
  const body = `${mismatchCount} audit_log row${mismatchCount === 1 ? '' : 's'} in ${schemaName} failed independent hash recomputation — the tamper-evident chain may have been altered outside the application. Review immediately.`;

  await prisma.notification.createMany({
    data: recipients.flatMap(({ id: userId }) => [
      {
        recipientUserId: userId,
        type: 'AUDIT_CHAIN_TAMPER_DETECTED',
        title,
        body,
        relatedEntityType: 'audit_checkpoints',
        relatedEntityId: checkpointId,
        channel: 'IN_APP' as const,
        status: 'PENDING' as const,
        dedupeKey: `audit-tamper:${checkpointId}:${userId}:IN_APP`,
      },
      {
        recipientUserId: userId,
        type: 'AUDIT_CHAIN_TAMPER_DETECTED',
        title,
        body,
        relatedEntityType: 'audit_checkpoints',
        relatedEntityId: checkpointId,
        channel: 'EMAIL' as const,
        status: 'PENDING' as const,
        dedupeKey: `audit-tamper:${checkpointId}:${userId}:EMAIL`,
      },
    ]),
    skipDuplicates: true,
  });
  return recipients.length;
}

/** One tenant's checkpoint + verify-since-last-checkpoint + alert-on-mismatch cycle. */
async function checkpointTenant(schemaName: string): Promise<TenantCheckpointResult> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: schemaName }, async () => {
    const prisma = getPrismaClient();

    const previousCheckpoint = await prisma.auditCheckpoint.findFirst({ orderBy: { checkpointAt: 'desc' } });

    const checkpointRows = await queryRawWithRlsContext<{ create_audit_checkpoint: string }>(
      Prisma.sql`SELECT create_audit_checkpoint()`,
    );
    const checkpointId = checkpointRows[0]?.create_audit_checkpoint;
    if (!checkpointId) throw new Error(`create_audit_checkpoint() returned no id for schema "${schemaName}"`);
    const checkpoint = await prisma.auditCheckpoint.findUniqueOrThrow({ where: { id: checkpointId } });

    const [mismatches, rowsChecked] = await Promise.all([
      findHashMismatches(previousCheckpoint?.checkpointAt ?? null, checkpoint.checkpointAt),
      prisma.auditLog.count({
        where: { createdAt: { gt: previousCheckpoint?.checkpointAt, lte: checkpoint.checkpointAt } },
      }),
    ]);

    let alertedRecipients = 0;
    if (mismatches.length > 0) {
      alertedRecipients = await alertOnTamperDetected(schemaName, checkpoint.id, mismatches.length);
      console.error(
        `[audit-checkpoint] TAMPER DETECTED in ${schemaName}: ${mismatches.length} hash mismatch(es) since checkpoint ${previousCheckpoint?.id ?? 'genesis'} — alerted ${alertedRecipients} recipient(s)`,
      );
    }

    return { schemaName, checkpointId: checkpoint.id, rowsChecked, mismatchCount: mismatches.length, alertedRecipients };
  });
}

/**
 * Exported standalone — same reasoning as every other job's run function
 * this session: testable/manually-runnable.
 */
export async function runAuditCheckpoint(): Promise<TenantCheckpointResult[]> {
  // getPlatformPrismaClient() is ALSO RLS-context-aware (mirrors
  // getPrismaClient()'s own fail-closed design, see packages/db-platform/
  // src/client.ts's wrapModelDelegate) — without a bound context here this
  // silently returns zero tenants rather than throwing, caught live via
  // this job's own manual verification run.
  const tenants = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findMany({ where: { status: 'ACTIVE' }, select: { schemaName: true } }),
  );
  const results: TenantCheckpointResult[] = [];
  for (const tenant of tenants) {
    results.push(await checkpointTenant(tenant.schemaName));
  }
  return results;
}

export function createAuditCheckpointQueue(connection: Redis): Queue {
  return new Queue(AUDIT_CHECKPOINT_QUEUE_NAME, { connection });
}

export function createAuditCheckpointWorker(connection: Redis): Worker {
  return new Worker(
    AUDIT_CHECKPOINT_QUEUE_NAME,
    async (_job: Job) => {
      const results = await runAuditCheckpoint();
      for (const r of results) {
        console.log(
          `[audit-checkpoint] ${r.schemaName}: checkpoint ${r.checkpointId}, ${r.rowsChecked} row(s) checked, ${r.mismatchCount} mismatch(es)`,
        );
      }
      return results;
    },
    { connection },
  );
}

/** Idempotent — see renewal-scan.job.ts's scheduleRenewalScan comment; same reasoning applies here. */
export async function scheduleAuditCheckpoint(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(AUDIT_CHECKPOINT_SCHEDULER_ID, { every: AUDIT_CHECKPOINT_INTERVAL_MS }, { name: 'checkpoint' });
}
