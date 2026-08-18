import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';

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
  /** Explicit recipient override (SendCaseEmailDialog) — omitted/empty falls back to resolveCaseEmail() in the worker. */
  to?: string[];
  cc?: string[];
  /**
   * Which tenant's schema the Activity/Case actually live in.
   *
   * REQUIRED for anything outside the seed tenant. The worker runs under
   * SYSTEM_JOB_CONTEXT, whose tenantSchema is null — i.e. the `public`
   * schema — so without this it looked up the activity in the WRONG schema,
   * found nothing, and returned 'skipped-not-found'. BullMQ records that as
   * a COMPLETED job, so every outbound case email from every real tenant was
   * silently dropped: no mail, no failed job, no log line. Captured here
   * from the request's own RLS context rather than passed by callers, so it
   * can never be forgotten at a call site.
   */
  tenantSchema: string | null;
}

/** Fire-and-forget: the Activity write already committed by the time this is called — a Redis hiccup here must never fail the HTTP response for a comment that already posted. Errors are logged, not thrown. jobId is the activityId itself (no colons, no BullMQ custom-id gotcha, and naturally idempotent — this comment's email can only ever be enqueued once). */
export async function enqueueCaseCommentEmail(payload: Omit<CaseCommentEmailPayload, 'tenantSchema'>): Promise<void> {
  try {
    // Read the tenant off the ambient request context at enqueue time — the
    // worker has no way to infer it later.
    const tenantSchema = getRlsContext()?.tenantSchema ?? null;
    await getQueue().add('case-comment-email', { ...payload, tenantSchema }, { jobId: payload.activityId });
  } catch (err) {
    console.error('[case-management] failed to enqueue outbound case comment email', err);
  }
}
