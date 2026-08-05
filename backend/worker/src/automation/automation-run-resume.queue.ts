/**
 * Consumer side of a WAITING_APPROVAL AutomationRunState being decided —
 * see backend/api/src/modules/case-management/automation-run-resume.util.ts
 * for the producer (automation-run-states.controller.ts's decision
 * endpoint enqueues here after recording the Approval decision). Separate
 * queue from automation-events (not reused) because this resume trigger
 * has nothing to do with an entity event — it's purely "this specific run
 * is now unblocked, advance it."
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { advanceRun } from './run-engine';

export const AUTOMATION_RUN_RESUME_QUEUE_NAME = 'automation-run-resume';

export interface AutomationRunResumeJobData {
  runStateId: string;
}

export function createAutomationRunResumeQueue(connection: Redis): Queue {
  return new Queue(AUTOMATION_RUN_RESUME_QUEUE_NAME, { connection });
}

export function createAutomationRunResumeWorker(connection: Redis): Worker {
  return new Worker(
    AUTOMATION_RUN_RESUME_QUEUE_NAME,
    async (job: Job<AutomationRunResumeJobData>) => {
      await advanceRun(job.data.runStateId);
      console.log(`[automation-run-resume] advanced run ${job.data.runStateId}`);
    },
    { connection },
  );
}
