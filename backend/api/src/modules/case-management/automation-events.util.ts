import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

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
  entityType: 'CLAIM' | 'CASE';
  entityId: string;
  eventType: string;
  occurredAt: string;
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
export async function enqueueEntityEvent(payload: EntityEventPayload): Promise<void> {
  try {
    const jobId = `${payload.entityType}_${payload.entityId}_${payload.eventType}_${payload.occurredAt}`;
    await getQueue().add('entity-event', payload, { jobId });
  } catch (err) {
    console.error('[case-management] failed to enqueue automation entity event', err);
  }
}
