import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer side of an OUTBOUND case comment's customer-facing email —
 * comments.service.ts calls this after the Activity write succeeds; the
 * worker's case-outbound-email Worker
 * (backend/worker/src/jobs/case-outbound-email/send-case-comment-email.job.ts)
 * consumes it. Queue NAME must stay in sync with
 * CASE_OUTBOUND_EMAIL_QUEUE_NAME there — BullMQ queues are identified by
 * name on the Redis side, no compile-time link between the two packages.
 * Lazy-singleton connection, same style as automation-events.util.ts.
 */
const CASE_OUTBOUND_EMAIL_QUEUE_NAME = 'case-outbound-email';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(CASE_OUTBOUND_EMAIL_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface CaseCommentEmailPayload {
  activityId: string;
  caseId: string;
}

/** Fire-and-forget: the Activity write already committed by the time this is called — a Redis hiccup here must never fail the HTTP response for a comment that already posted. Errors are logged, not thrown. jobId is the activityId itself (no colons, no BullMQ custom-id gotcha, and naturally idempotent — this comment's email can only ever be enqueued once). */
export async function enqueueCaseCommentEmail(payload: CaseCommentEmailPayload): Promise<void> {
  try {
    await getQueue().add('case-comment-email', payload, { jobId: payload.activityId });
  } catch (err) {
    console.error('[case-management] failed to enqueue outbound case comment email', err);
  }
}
