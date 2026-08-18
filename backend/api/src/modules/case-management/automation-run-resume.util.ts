import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';

/**
 * Producer side of resuming a WAITING_APPROVAL AutomationRunState —
 * automation-run-states.controller.ts's decision endpoint calls this after
 * recording the Approval decision; the worker's
 * automation-run-resume Worker
 * (backend/worker/src/automation/automation-run-resume.queue.ts) consumes
 * it and calls advanceRun(). Queue NAME must stay in sync with
 * AUTOMATION_RUN_RESUME_QUEUE_NAME there. Lazy-singleton connection, same
 * style as automation-events.util.ts / case-outbound-email.util.ts.
 */
const AUTOMATION_RUN_RESUME_QUEUE_NAME = 'automation-run-resume';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(AUTOMATION_RUN_RESUME_QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * Fire-and-forget: the Approval decision already committed by the time
 * this is called. Deliberately NO custom jobId — a run with more than one
 * APPROVAL_GATE step pauses and gets resumed more than once over its
 * lifetime, so a jobId keyed on runStateId alone would collide across
 * gates (BullMQ jobIds must be unique for the life of the job record).
 * Safe without one: advanceRun() is idempotent by construction (it no-ops
 * unless the run is currently RUNNING), so a redundant or duplicate
 * resume enqueue can never double-execute a step.
 */
export async function enqueueAutomationRunResume(runStateId: string): Promise<void> {
  // Captured from the deciding user's request context. Without it the worker
  // binds SYSTEM_JOB_CONTEXT (tenantSchema: null → `public`), looks for the
  // run state in the seed schema, finds nothing, and the approved workflow
  // never resumes — the approver sees their decision recorded and the
  // workflow silently stops. Same defect class as the entity-event path.
  const tenantSchema = getRlsContext()?.tenantSchema ?? null;
  try {
    await getQueue().add('resume', { runStateId, tenantSchema });
  } catch (err) {
    console.error('[case-management] failed to enqueue automation run resume', err);
  }
}
