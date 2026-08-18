import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';
import type { AutomationEntityType } from '@topiadesk/automation';

/**
 * Producer for actions a macro asks for but the API must not perform itself.
 *
 * The API's action registry backs Macro application — a person clicking
 * "apply" on an open record, inside their own HTTP request. Three of the
 * eleven actions reach outside the system: SEND_EMAIL waits on someone
 * else's SMTP server, CALL_WEBHOOK on an arbitrary URL, NOTIFY_TEAMS_CHANNEL
 * on Microsoft. Running any of them inline would hang a user's request on a
 * third party, and a slow endpoint would look to the agent like the macro
 * had frozen.
 *
 * So the API hands them to the worker instead, which already implements all
 * three and where waiting costs nothing. The macro returns immediately and
 * reports the action as accepted rather than completed — an honest
 * distinction, since at that point it genuinely has been accepted and not
 * yet performed.
 *
 * Deliberately generic over actionType rather than three bespoke queues: the
 * worker executes whatever it is handed through its OWN registry, so any
 * action the worker gains later is automatically available to macros without
 * a new queue, a new producer, or a new consumer.
 */
const AUTOMATION_ASYNC_ACTION_QUEUE_NAME = 'automation-async-action';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(AUTOMATION_ASYNC_ACTION_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface AsyncActionJobData {
  actionType: string;
  params: Record<string, unknown>;
  entityType: AutomationEntityType;
  entityId: string;
  /** Who applied the macro — recorded on anything the action writes. */
  actingUserId: string | null;
  /**
   * Which tenant's schema the record lives in. Captured here because the
   * worker has no request to recover it from, and a job without it runs
   * against `public` and silently finds nothing — the defect that made the
   * entity-event path dead for every real tenant.
   */
  tenantSchema: string | null;
}

/**
 * Fire-and-forget. A Redis hiccup must not fail the macro application whose
 * other actions have already been performed and committed; the failure is
 * logged rather than thrown, matching enqueueEntityEvent's contract.
 */
export async function enqueueAsyncAction(
  data: Omit<AsyncActionJobData, 'tenantSchema'>,
): Promise<void> {
  try {
    const tenantSchema = getRlsContext()?.tenantSchema ?? null;
    await getQueue().add('async-action', { ...data, tenantSchema });
  } catch (err) {
    console.error('[case-management] failed to enqueue async automation action', err);
  }
}
