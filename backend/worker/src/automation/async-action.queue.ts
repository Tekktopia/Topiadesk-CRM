/**
 * Consumer for actions a macro delegated to the worker.
 *
 * The API's registry deliberately does not implement SEND_EMAIL,
 * CALL_WEBHOOK or NOTIFY_TEAMS_CHANNEL — all three block on a third party,
 * and a macro runs inside a user's HTTP request (see the producer's header).
 * They arrive here instead and run through this side's registry, which
 * already implements all of them.
 *
 * Generic over actionType on purpose: it executes whatever it is handed
 * through the same `executeActions` path AutomationRules use, so anything
 * the worker's registry gains later is available to macros with no change
 * here.
 */
import { Worker, Queue, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
import type { AutomationEntityType } from '@topiadesk/automation';
import './handlers';
import { deriveExecutionStatus, executeActions, type CaseManagementEntityRef } from './action-handler';

export const AUTOMATION_ASYNC_ACTION_QUEUE_NAME = 'automation-async-action';

export interface AsyncActionJobData {
  actionType: string;
  params: Record<string, unknown>;
  entityType: AutomationEntityType;
  entityId: string;
  actingUserId: string | null;
  tenantSchema: string | null;
}

export async function processAsyncAction(data: AsyncActionJobData): Promise<{ ok: boolean; error?: string }> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: data.tenantSchema ?? null }, async () => {
    const ticketRef: CaseManagementEntityRef | undefined =
      data.entityType === 'CLAIM'
        ? { entityType: 'CLAIM', claimId: data.entityId }
        : data.entityType === 'CASE'
          ? { entityType: 'CASE', caseId: data.entityId }
          : undefined;

    const results = await executeActions([{ actionType: data.actionType, params: data.params }], {
      target: { entityType: data.entityType, id: data.entityId },
      // Not passed through from the API: the row may have changed between
      // the macro being applied and this running, and an email should quote
      // what is true when it is sent.
      targetData: null,
      entity: ticketRef,
      actingUserId: data.actingUserId,
      systemJobName: `macro-async:${data.actionType}`,
    });

    // Logged like any other automation firing, so a macro's emails are as
    // auditable as a rule's — otherwise the deferred half of a macro would
    // vanish from the record entirely.
    await getPrismaClient().automationExecutionLog.create({
      data: {
        ruleId: null,
        ruleName: `Macro action: ${data.actionType}`,
        entityType: data.entityType,
        entityId: data.entityId,
        triggerSource: 'MACRO_ASYNC',
        status: deriveExecutionStatus(results),
        actionResults: results as unknown as Prisma.InputJsonValue,
      },
    });

    const first = results[0];
    if (!first?.ok) {
      console.error(`[automation-async-action] ${data.actionType} on ${data.entityType} ${data.entityId} failed: ${first?.error}`);
      return { ok: false, error: first?.error };
    }
    return { ok: true };
  });
}

export function createAutomationAsyncActionQueue(connection: Redis): Queue {
  return new Queue(AUTOMATION_ASYNC_ACTION_QUEUE_NAME, { connection });
}

export function createAutomationAsyncActionWorker(connection: Redis): Worker {
  return new Worker(
    AUTOMATION_ASYNC_ACTION_QUEUE_NAME,
    async (job: Job<AsyncActionJobData>) => processAsyncAction(job.data),
    { connection },
  );
}
