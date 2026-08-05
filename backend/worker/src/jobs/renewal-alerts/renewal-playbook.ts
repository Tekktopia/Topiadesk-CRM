/**
 * Renewal Playbooks — the first real AutomationRule consumer, hooked
 * narrowly into renewal-scan.job.ts's existing per-threshold loop rather
 * than building a parallel scan mechanism (per the build brief).
 *
 * Idempotency: this is only called from the loop's "fresh notification
 * just created" branch (see renewal-scan.job.ts), reusing
 * Notification.dedupeKey's unique constraint — the job's own load-bearing
 * idempotency layer — as this feature's idempotency boundary too, instead
 * of inventing a second one. Task has no dedupeKey-style unique column to
 * lean on the way Notification does, and adding one is a schema change
 * outside this narrow hook's scope. Consequence: a schedule with no
 * assignedToId/brokerOfRecordId (renewal-scan.job.ts's "nobody to notify"
 * branch) also gets no automation actions run — consistent with that
 * branch already being a no-op for notifications, not a new gap
 * introduced here.
 *
 * Action execution reuses the SAME shared registry case-management's
 * automation-events.queue.ts uses (backend/worker/src/automation/
 * action-handler.ts) — see renewal-task-handler.ts's header comment for
 * why this calls `getActionHandler(...).execute(...)` directly rather than
 * going through that file's Claim/Case-only `executeActions`/
 * `processEntityEvent`.
 */
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { getActionHandler, type ActionSpec, type AutomationActionContext } from '../../automation/action-handler';
import '../../automation/renewal-task-handler';

interface RenewalPlaybookConditions {
  entityType?: 'RENEWAL_SCHEDULE';
  /** If omitted, the rule fires at every threshold crossing. */
  thresholds?: number[];
  /** Simple equality filters against a small fixed allowlist — same "fixed keys, never raw query" principle as SavedView.filters. */
  filters?: { lineOfBusiness?: string };
}

function conditionsMatch(conditions: Prisma.JsonValue, threshold: number, lineOfBusiness: string | null): boolean {
  if (conditions === null || typeof conditions !== 'object' || Array.isArray(conditions)) return false;
  const c = conditions as RenewalPlaybookConditions;
  if (c.entityType && c.entityType !== 'RENEWAL_SCHEDULE') return false;
  if (c.thresholds && c.thresholds.length > 0 && !c.thresholds.includes(threshold)) return false;
  if (c.filters?.lineOfBusiness && c.filters.lineOfBusiness !== lineOfBusiness) return false;
  return true;
}

// CREATE_TASK never reads ctx.entity (see renewal-task-handler.ts) — this
// placeholder only exists to satisfy AutomationActionHandler.execute's
// signature at this one call site, which sits outside case-management's
// own Claim/Case entity-event path.
const RENEWAL_ACTION_CTX = {
  entity: { entityType: 'CASE', caseId: '' },
  actingUserId: null,
  systemJobName: 'renewal-playbook',
} as unknown as AutomationActionContext;

export interface RenewalPlaybookParams {
  policyId: string;
  lineOfBusiness: string | null;
  accountId: string;
  threshold: number;
  defaultAssigneeId: string;
}

export async function runRenewalPlaybooks(params: RenewalPlaybookParams): Promise<{ matchedRules: number }> {
  const prisma = getPrismaClient();
  const rules = await prisma.automationRule.findMany({ where: { triggerType: 'ENTITY_EVENT', isActive: true } });
  const matched = rules.filter((rule) => conditionsMatch(rule.conditions, params.threshold, params.lineOfBusiness));

  for (const rule of matched) {
    const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as ActionSpec[]) : [];
    for (const action of actions) {
      const handler = getActionHandler(action.actionType);
      if (!handler) {
        console.warn(`[renewal-playbook] rule ${rule.id} (${rule.name}) references unknown actionType "${action.actionType}" — skipping`);
        continue;
      }
      // Rule-authored params win over these defaults when both set the same key.
      const resolvedParams: Record<string, unknown> = {
        assigneeId: params.defaultAssigneeId,
        accountId: params.accountId,
        policyId: params.policyId,
        ...action.params,
      };
      try {
        await handler.execute(resolvedParams, RENEWAL_ACTION_CTX);
      } catch (err) {
        console.error(`[renewal-playbook] rule ${rule.id} (${rule.name}) action "${action.actionType}" failed for policy ${params.policyId}`, err);
      }
    }
  }

  return { matchedRules: matched.length };
}
