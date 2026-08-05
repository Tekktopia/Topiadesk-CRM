/**
 * AutomationRule's ENTITY_EVENT trigger. Case/claim mutations in the API
 * enqueue an event onto this queue after their DB write commits (see
 * backend/api/src/modules/case-management/automation-events.util.ts); this
 * processor matches the event against active `triggerType: 'ENTITY_EVENT'`
 * AutomationRule rows and runs any that match through the same action
 * registry Macro uses (./action-handler.ts, ./handlers.ts).
 *
 * `AutomationRule.triggerType` also has a SCHEDULE value in the schema, but
 * the model has no cron/interval column to drive a schedule from — SCHEDULE
 * rows are accepted by assignment-rules.controller.ts-style CRUD (actually
 * macros/assignment-rules controllers, N/A here — AutomationRule itself has
 * no dedicated controller in this build's scope) but never executed by
 * this processor. Flagged in the module report as a schema gap, not
 * something invented here since prisma/schema.prisma is already migrated
 * and out of this module's authority to alter.
 *
 * Idempotency: the BullMQ job id is
 * `{entityType}:{entityId}:{eventType}:{occurredAt ISO string}` (the exact
 * scheme specified in the build brief) — enqueuing the identical event
 * twice (e.g. a retried request after the DB write already committed) is a
 * harmless duplicate-jobId no-op at the queue level, the same idempotency
 * mechanism the renewal-scan scheduler relies on for its repeat-tick ids.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
import './handlers';
import { executeActions, type ActionSpec, type CaseManagementEntityRef } from './action-handler';

export const AUTOMATION_EVENTS_QUEUE_NAME = 'automation-events';

export interface EntityEventPayload {
  entityType: 'CLAIM' | 'CASE';
  entityId: string;
  eventType: string;
  occurredAt: string;
}

interface AutomationConditions {
  entityType?: 'CLAIM' | 'CASE';
  eventTypes?: string[];
  /** Simple equality filters against a small allowlist of scalar entity fields — matches SavedView.filters' own documented "fixed allowlist", not an open query. */
  filters?: Record<string, unknown>;
}

const FILTERABLE_FIELDS = new Set(['status', 'priority', 'caseType', 'categoryId', 'assignedToId', 'assignedTeamId', 'adjusterId']);

function conditionsMatch(conditions: Prisma.JsonValue, event: EntityEventPayload, entity: Record<string, unknown>): boolean {
  if (conditions === null || typeof conditions !== 'object' || Array.isArray(conditions)) return false;
  const c = conditions as AutomationConditions;
  if (c.entityType && c.entityType !== event.entityType) return false;
  if (c.eventTypes && c.eventTypes.length > 0 && !c.eventTypes.includes(event.eventType)) return false;
  if (c.filters) {
    for (const [field, expected] of Object.entries(c.filters)) {
      if (!FILTERABLE_FIELDS.has(field)) continue;
      if (entity[field] !== expected) return false;
    }
  }
  return true;
}

export async function processEntityEvent(payload: EntityEventPayload): Promise<{ matchedRules: number; results: unknown[] }> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const entity =
      payload.entityType === 'CLAIM'
        ? await prisma.claim.findUnique({ where: { id: payload.entityId } })
        : await prisma.case.findUnique({ where: { id: payload.entityId } });
    if (!entity) {
      console.warn(`[automation-events] ${payload.entityType} ${payload.entityId} no longer exists — skipping`);
      return { matchedRules: 0, results: [] };
    }

    const rules = await prisma.automationRule.findMany({ where: { triggerType: 'ENTITY_EVENT', isActive: true } });
    const matched = rules.filter((rule) => conditionsMatch(rule.conditions, payload, entity as unknown as Record<string, unknown>));

    const entityRef: CaseManagementEntityRef =
      payload.entityType === 'CLAIM' ? { entityType: 'CLAIM', claimId: payload.entityId } : { entityType: 'CASE', caseId: payload.entityId };

    const results: unknown[] = [];
    for (const rule of matched) {
      const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as ActionSpec[]) : [];
      const result = await executeActions(actions, { entity: entityRef, actingUserId: null, systemJobName: `automation-rule:${rule.name}` });
      results.push({ ruleId: rule.id, ruleName: rule.name, result });
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
