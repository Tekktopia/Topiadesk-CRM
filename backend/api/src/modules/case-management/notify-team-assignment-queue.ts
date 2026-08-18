import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';

/**
 * Producer side of "a ticket was just assigned to a team, tell every
 * member" — same producer/consumer split as
 * send-bulk-invite-email-queue.ts. Deliberately its own job rather than a
 * SEND_NOTIFICATION/SEND_EMAIL AutomationRule action: those handlers only
 * know a `recipientTeamId` baked into the rule's config at author time,
 * not "whichever team this specific case just got assigned to" — this job
 * resolves that dynamically from the Case itself, every time a real
 * assignment happens.
 */
const NOTIFY_TEAM_ASSIGNMENT_QUEUE_NAME = 'notify-team-assignment';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(NOTIFY_TEAM_ASSIGNMENT_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface NotifyTeamAssignmentJobData {
  caseId: string;
  teamId: string;
  /** See the worker's matching comment — the job cannot infer this later. */
  tenantSchema: string | null;
}

/** Fire-and-forget, same reasoning as enqueueBulkInviteEmail — additive to
 * a case create/update that already committed; a Redis hiccup here must
 * never fail (or partially undo) an already-saved assignment. */
export async function enqueueTeamAssignmentNotification(
  data: Omit<NotifyTeamAssignmentJobData, 'tenantSchema'>,
): Promise<void> {
  try {
    const q = getQueue();
    const tenantSchema = getRlsContext()?.tenantSchema ?? null;
    await q.add('notify-team-assignment', { ...data, tenantSchema } satisfies NotifyTeamAssignmentJobData, {
      removeOnComplete: true,
      removeOnFail: 100,
    });
  } catch (err) {
    console.error('[case-management] failed to enqueue team-assignment notification', err);
  }
}
