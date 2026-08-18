/**
 * AutomationRule's ENTITY_EVENT trigger. Case/claim mutations in the API
 * enqueue an event onto this queue after their DB write commits (see
 * backend/api/src/modules/case-management/automation-events.util.ts); this
 * processor matches the event against active `triggerType: 'ENTITY_EVENT'`
 * AutomationRule rows and runs any that match through the same action
 * registry Macro uses (./action-handler.ts, ./handlers.ts).
 *
 * SCHEDULE-triggered rules are NOT handled here — they are found and run by
 * jobs/automation-schedule/schedule-scan.job.ts, which polls for rules whose
 * `nextRunAt` has passed. (This comment previously recorded that SCHEDULE
 * had no cron column and no consumer at all, which was true and was the
 * module's largest gap; both now exist.)
 *
 * Idempotency: the BullMQ job id is
 * `{entityType}_{entityId}_{eventType}_{occurredAt ISO string}` — enqueuing the identical event
 * twice (e.g. a retried request after the DB write already committed) is a
 * harmless duplicate-jobId no-op at the queue level, the same idempotency
 * mechanism the renewal-scan scheduler relies on for its repeat-tick ids.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
import { evaluateConditions, getEntityMeta, normalizeConditions, type AutomationEntityType } from '@topiadesk/automation';
import './handlers';
import { deriveExecutionStatus, executeActions, type ActionSpec, type CaseManagementEntityRef } from './action-handler';
import { startRun } from './run-engine';

export const AUTOMATION_EVENTS_QUEUE_NAME = 'automation-events';

export interface EntityEventPayload {
  entityType: AutomationEntityType;
  entityId: string;
  eventType: string;
  occurredAt: string;
  /** See the producer's comment — its absence is why this path never ran for a real tenant. */
  tenantSchema?: string | null;
}

/**
 * Matches an event against a rule's conditions.
 *
 * Was a bespoke three-key check with a seven-field allowlist that SKIPPED any
 * condition naming a field outside it — so a rule with a typo'd or
 * CRM-entity field name matched everything instead of nothing, which on a
 * rule that mutates records is the dangerous direction to fail in. Now
 * delegates to the shared condition engine, which supports real operators and
 * the same eight entity types the scheduler does, and which the API validates
 * against at save time so an unknown field is rejected before it can run.
 */
function conditionsMatch(conditions: Prisma.JsonValue, event: EntityEventPayload, entity: Record<string, unknown>, now: Date): boolean {
  const parsed = normalizeConditions(conditions);
  if (parsed.entityType && parsed.entityType !== event.entityType) return false;
  if (parsed.eventTypes && parsed.eventTypes.length > 0 && !parsed.eventTypes.includes(event.eventType)) return false;
  return evaluateConditions(parsed, entity, now);
}

export async function processEntityEvent(payload: EntityEventPayload): Promise<{ matchedRules: number; results: unknown[] }> {
  // `tenantSchema` rather than the bare SYSTEM_JOB_CONTEXT this used to bind.
  // That context carries tenantSchema: null, which resolves to the `public`
  // schema — so every event about a real tenant's record looked for that
  // record in the seed tenant, found nothing, and skipped. See the payload's
  // own comment; this is the fix for it.
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: payload.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();
    const now = new Date();
    const meta = getEntityMeta(payload.entityType);
    if (!meta) {
      console.warn(`[automation-events] unknown entity type ${payload.entityType} — skipping`);
      return { matchedRules: 0, results: [] };
    }
    const delegate = prisma[meta.model] as unknown as { findUnique(args: unknown): Promise<Record<string, unknown> | null> };
    const entity = await delegate.findUnique({ where: { id: payload.entityId } });
    if (!entity) {
      console.warn(`[automation-events] ${payload.entityType} ${payload.entityId} no longer exists — skipping`);
      return { matchedRules: 0, results: [] };
    }

    // status:'PUBLISHED' keeps DRAFT rules (autosaved in-progress edits
    // from the /admin/workflows builder) from ever running, regardless of
    // isActive — see AutomationRule.status's schema comment.
    const rules = await prisma.automationRule.findMany({ where: { triggerType: 'ENTITY_EVENT', isActive: true, status: 'PUBLISHED' } });
    const matched = rules.filter((rule) => conditionsMatch(rule.conditions, payload, entity, now));

    // A CaseCategory can name a "default workflow" guaranteed to run on
    // CASE CREATED for that category, independent of the rule's own
    // stored conditions (see CaseCategory.defaultWorkflowId's schema
    // comment) — merged into the normally-matched set here (deduped by
    // id, since an admin may have ALSO configured a matching condition on
    // the same rule) rather than a second execution path, so it
    // transparently supports both flat-action and steps-based rules with
    // no restriction on rule shape.
    if (payload.entityType === 'CASE' && payload.eventType === 'CREATED') {
      const categoryId = (entity as { categoryId?: string | null }).categoryId;
      if (categoryId) {
        const category = await prisma.caseCategory.findUnique({ where: { id: categoryId }, select: { defaultWorkflowId: true } });
        if (category?.defaultWorkflowId && !matched.some((r) => r.id === category.defaultWorkflowId)) {
          const defaultRule = await prisma.automationRule.findFirst({
            where: { id: category.defaultWorkflowId, isActive: true, status: 'PUBLISHED' },
          });
          if (defaultRule) matched.push(defaultRule);
        }
      }
    }

    // Undefined for the six entity types that are not tickets — the
    // ticket-only actions raise a readable error via requireTicketRef rather
    // than reading a property off a ref that cannot exist.
    const entityRef: CaseManagementEntityRef | undefined =
      payload.entityType === 'CLAIM'
        ? { entityType: 'CLAIM', claimId: payload.entityId }
        : payload.entityType === 'CASE'
          ? { entityType: 'CASE', caseId: payload.entityId }
          : undefined;

    const results: unknown[] = [];
    for (const rule of matched) {
      // A rule with a non-empty `steps` sequence runs through the
      // multi-step engine (run-engine.ts) instead of the flat `actions`
      // list below — the two are mutually exclusive per rule, not
      // layered. See AutomationRule.steps's schema comment.
      if (Array.isArray(rule.steps) && rule.steps.length > 0) {
        await startRun(rule, payload.entityType, payload.entityId);
        results.push({ ruleId: rule.id, ruleName: rule.name, result: 'multi-step run started' });
        continue;
      }
      const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as ActionSpec[]) : [];
      const result = await executeActions(actions, {
        target: { entityType: payload.entityType, id: payload.entityId },
        targetData: entity,
        entity: entityRef,
        actingUserId: null,
        systemJobName: `automation-rule:${rule.name}`,
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, result });
      await prisma.automationExecutionLog.create({
        data: {
          ruleId: rule.id,
          ruleName: rule.name,
          entityType: payload.entityType,
          entityId: payload.entityId,
          triggerSource: 'ENTITY_EVENT',
          status: deriveExecutionStatus(result),
          actionResults: result as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return { matchedRules: matched.length, results };
  });
}

export function createAutomationEventsQueue(connection: Redis): Queue {
  return new Queue(AUTOMATION_EVENTS_QUEUE_NAME, { connection });
}

export function createAutomationEventsWorker(connection: Redis): Worker {
  return new Worker(
    AUTOMATION_EVENTS_QUEUE_NAME,
    async (job: Job<EntityEventPayload>) => {
      const result = await processEntityEvent(job.data);
      console.log(`[automation-events] ${job.data.entityType} ${job.data.entityId} ${job.data.eventType}: ${result.matchedRules} rule(s) matched`);
      return result;
    },
    { connection },
  );
}
