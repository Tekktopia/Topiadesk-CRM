import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

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
  try {
    await getQueue().add('resume', { runStateId });
  } catch (err) {
    console.error('[case-management] failed to enqueue automation run resume', err);
  }
}
