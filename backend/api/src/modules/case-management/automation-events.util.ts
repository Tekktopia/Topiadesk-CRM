import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';
import type { AutomationEntityType } from '@topiadesk/automation';

/**
 * Producer side of AutomationRule's ENTITY_EVENT trigger. Case/claim
 * mutations call `enqueueEntityEvent` after their DB write succeeds; the
 * worker's `automation-events` BullMQ Worker
 * (backend/worker/src/automation/automation-events.queue.ts) consumes it,
 * matches active ENTITY_EVENT AutomationRule rows, and runs their actions.
 * Queue NAME must stay in sync with AUTOMATION_EVENTS_QUEUE_NAME there —
 * BullMQ queues are identified by name on the Redis side, there is no
 * compile-time link between the two packages.
 *
 * Connection modeled on documents/minio-client.ts's lazy-singleton style —
 * this is the first BullMQ *producer* in backend/api (the worker package
 * already depends on bullmq/ioredis for its own queues; this module adds
 * the same two packages as backend/api dependencies).
 */
const AUTOMATION_EVENTS_QUEUE_NAME = 'automation-events';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(AUTOMATION_EVENTS_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface EntityEventPayload {
  entityType: AutomationEntityType;
  entityId: string;
  eventType: string;
  occurredAt: string;
  /**
   * Which tenant's schema the record lives in.
   *
   * Was absent, and its absence made ENTITY_EVENT automation dead for every
   * real tenant. The worker binds `SYSTEM_JOB_CONTEXT` to run the event,
   * whose `tenantSchema` is null — which resolves to `public`, the seed
   * tenant. So an event about a SCIB ticket sent the worker looking for that
   * ticket in `public`, where it does not exist; the lookup returned null,
   * the processor logged "no longer exists — skipping", and no rule ever ran.
   * Silent, because skipping a deleted record is legitimate behaviour and
   * looks identical in the logs.
   *
   * This is the seventh instance of the same defect in this codebase (queued
   * work capturing no tenant context and defaulting to public). It is
   * captured at enqueue time from the request's RLS context because that is
   * the only point where the tenant is still known — the worker has no
   * request to recover it from.
   */
  tenantSchema: string | null;
}

/**
 * Fire-and-forget: automation is additive functionality layered on top of
 * the Claim/Case write that already committed by the time this is called —
 * a Redis hiccup here must never fail (or roll back) the HTTP response for
 * a write that already succeeded. Errors are logged, not thrown.
 *
 * jobId is `{entityType}_{entityId}_{eventType}_{occurredAt}` — underscore-
 * separated, not colon-separated as originally specified in the build
 * brief. Discovered live: BullMQ's Job class only accepts a colon-
 * containing custom id when splitting on ':' yields exactly 3 parts (a
 * legacy repeatable-job-id compatibility check — see bullmq's
 * classes/job.js), and `occurredAt` is an ISO 8601 timestamp, which itself
 * contains two colons in its time portion — so every single call here threw
 * "Custom Id cannot contain :", silently swallowed by the try/catch below.
 * ENTITY_EVENT automation rules have never actually fired as a result;
 * this is the fix, not a cosmetic rename. BullMQ still treats a duplicate
 * jobId as a no-op add regardless of separator, so the dedup guarantee is
 * unaffected.
 */
export async function enqueueEntityEvent(payload: Omit<EntityEventPayload, 'tenantSchema'>): Promise<void> {
  try {
    // Captured HERE, not asked of the caller. Every one of the ~30 emit
    // sites would otherwise have to remember to pass it, and the failure
    // mode when one forgets is invisible (the event is skipped as if the
    // record had been deleted). Reading it from the ambient RLS context
    // makes it impossible to omit.
    const tenantSchema = getRlsContext()?.tenantSchema ?? null;
    const jobId = `${payload.entityType}_${payload.entityId}_${payload.eventType}_${payload.occurredAt}`;
    await getQueue().add('entity-event', { ...payload, tenantSchema }, { jobId });
  } catch (err) {
    console.error('[case-management] failed to enqueue automation entity event', err);
  }
}
