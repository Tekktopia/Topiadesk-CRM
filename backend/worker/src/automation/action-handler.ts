/**
 * Macro.actions and AutomationRule.actions both hold an `ActionSpec[]` JSON
 * array of this exact shape (per the build brief) — one registry, one set
 * of concrete handlers, for both. AutomationRule fires here, from the
 * `automation-events` BullMQ queue processor (automation-events.worker.ts)
 * on an ENTITY_EVENT trigger; Macro applies synchronously from the API's
 * macros.controller.ts / cases.controller.ts::applyMacro
 * (backend/api/src/modules/case-management/automation/ — the identical
 * interface, duplicated there: backend/api and backend/worker are separate
 * deployable packages with no in-repo import path between their src/ trees,
 * see backend/api/.../business-hours.util.ts's header comment for the same
 * constraint applied to SLA date math). Keep both sides' `actionType` keys
 * and params shapes in sync.
 */

import type { AutomationEntityType } from '@topiadesk/automation';

export interface ActionSpec {
  actionType: string;
  params: Record<string, unknown>;
}

export type CaseManagementEntityRef = { entityType: 'CLAIM'; claimId: string } | { entityType: 'CASE'; caseId: string };

export interface AutomationActionContext {
  /**
   * The record the rule fired on, for every entity type automation now
   * supports. `entity` below stays the narrow CASE/CLAIM union the six
   * original ticket actions were written against; this is the general form
   * the newer actions (email, task, field update, webhook) use so they can
   * run against a policy or an opportunity too.
   */
  target: { entityType: AutomationEntityType; id: string };
  /**
   * The already-loaded row. Passed through rather than re-queried because
   * every caller has just fetched it to evaluate the rule's conditions, and
   * because template placeholders must render from the SAME snapshot the
   * conditions matched — re-reading invites a rule that says "premium is
   * overdue" sending a message quoting a premium that was paid in between.
   */
  targetData: Record<string, unknown> | null;
  /**
   * Narrow ticket ref. Undefined when the rule fired on something that is
   * not a case or a claim — the ticket-only actions call `requireTicketRef`
   * and fail cleanly rather than silently no-op'ing.
   */
  entity?: CaseManagementEntityRef;
  /** Always null here — every action run through this registry is fired by a background AutomationRule, never a human request. */
  actingUserId: string | null;
  /** Flows into Activity.createdBySystemJob for ADD_INTERNAL_NOTE — identifies which automation rule/job produced the note. */
  systemJobName: string | null;
}

/**
 * Ticket-only actions call this instead of reaching for `ctx.entity`.
 *
 * Automation can now fire on policies, opportunities, leads and clients, none
 * of which have a status or an assignee in the ticket sense. The action
 * catalog already stops the builder offering "set status" on a policy, but
 * that is a UI guard — a rule stored before the entity type was changed, or
 * posted directly to the API, must still fail with something an admin can
 * read rather than throwing on an undefined property.
 */
export function requireTicketRef(ctx: AutomationActionContext): CaseManagementEntityRef {
  if (!ctx.entity) {
    throw new Error(`This action only works on tickets and claims — it cannot run on a ${ctx.target.entityType.toLowerCase()}.`);
  }
  return ctx.entity;
}

export interface AutomationActionHandler {
  actionType: string;
  execute(params: Record<string, unknown>, ctx: AutomationActionContext): Promise<void>;
}

export interface ActionExecutionResult {
  actionType: string;
  ok: boolean;
  error?: string;
}

const registry = new Map<string, AutomationActionHandler>();

export function registerActionHandler(handler: AutomationActionHandler): void {
  registry.set(handler.actionType, handler);
}

export function getActionHandler(actionType: string): AutomationActionHandler | undefined {
  return registry.get(actionType);
}

export function listRegisteredActionTypes(): string[] {
  return [...registry.keys()];
}

/**
 * Runs every action in order, best-effort: one bad/unknown action is
 * recorded as a failure in the returned result list but does not stop the
 * remaining actions from running.
 */
export async function executeActions(actions: ActionSpec[], ctx: AutomationActionContext): Promise<ActionExecutionResult[]> {
  const results: ActionExecutionResult[] = [];
  for (const action of actions) {
    const handler = registry.get(action.actionType);
    if (!handler) {
      results.push({ actionType: action.actionType, ok: false, error: `Unknown actionType: ${action.actionType}` });
      continue;
    }
    try {
      await handler.execute(action.params ?? {}, ctx);
      results.push({ actionType: action.actionType, ok: true });
    } catch (err) {
      results.push({ actionType: action.actionType, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** SUCCESS/PARTIAL_FAILURE/FAILED for AutomationExecutionLog.status — shared by both flat-execution sites (automation-events.queue.ts, renewal-playbook.ts) so the two logging call sites can't drift on what "failed" means. Empty (no actions configured) counts as SUCCESS — there was nothing to fail. */
export function deriveExecutionStatus(results: ActionExecutionResult[]): 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED' {
  if (results.length === 0) return 'SUCCESS';
  const failedCount = results.filter((r) => !r.ok).length;
  if (failedCount === 0) return 'SUCCESS';
  if (failedCount === results.length) return 'FAILED';
  return 'PARTIAL_FAILURE';
}
