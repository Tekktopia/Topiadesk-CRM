import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';

/**
 * Producer side of "a ticket was just assigned to a PERSON, tell them".
 *
 * The team-assignment counterpart (notify-team-assignment-queue.ts) already
 * existed; the individual case did not, so assigning a ticket to a named
 * agent notified nobody — the assignee only found out by stumbling across
 * the ticket in a list. Reported live: a ticket was assigned and the
 * assignee never saw it.
 *
 * Deliberately its own job rather than a SEND_NOTIFICATION AutomationRule
 * action, for the same reason the team job is: a rule only knows a
 * recipient baked in at author time, not "whoever this specific case was
 * just handed to".
 */
const NOTIFY_CASE_ASSIGNMENT_QUEUE_NAME = 'notify-case-assignment';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(NOTIFY_CASE_ASSIGNMENT_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface NotifyCaseAssignmentJobData {
  caseId: string;
  /** The user the ticket was handed to. */
  assigneeId: string;
  /** Who did the assigning — used to suppress self-assignment pings. */
  assignedById?: string;
  /** ISO timestamp of THIS assignment; part of the dedupe key so a genuine
   * re-assignment back to the same person still notifies, while a retry of
   * the same job stays idempotent. */
  assignedAt: string;
  /**
   * Which tenant's schema the Case/User rows live in.
   *
   * REQUIRED outside the seed tenant. The worker runs under
   * SYSTEM_JOB_CONTEXT, whose tenantSchema is null — i.e. `public` — so
   * without this it would look the case up in the wrong schema, find
   * nothing, and return 'skipped' as a COMPLETED job: no notification, no
   * failure, no log. That exact bug was live in the outbound-email and
   * team-assignment jobs. Captured from the request's own RLS context so it
   * cannot be forgotten at a call site.
   */
  tenantSchema: string | null;
}

/**
 * Fire-and-forget: the assignment has already committed by the time this
 * runs, so a Redis hiccup must never fail (or partially undo) it. Errors are
 * logged, not thrown — same contract as enqueueTeamAssignmentNotification.
 *
 * Self-assignment is dropped here rather than in the worker: there is no
 * point queueing a job whose only outcome is "tell someone what they just
 * did themselves".
 */
export async function enqueueCaseAssignmentNotification(
  data: Omit<NotifyCaseAssignmentJobData, 'tenantSchema'>,
): Promise<void> {
  if (data.assignedById && data.assignedById === data.assigneeId) return;
  try {
    const tenantSchema = getRlsContext()?.tenantSchema ?? null;
    await getQueue().add(
      'notify-case-assignment',
      { ...data, tenantSchema } satisfies NotifyCaseAssignmentJobData,
      { removeOnComplete: true, removeOnFail: 100 },
    );
  } catch (err) {
    console.error('[case-management] failed to enqueue case-assignment notification', err);
  }
}
