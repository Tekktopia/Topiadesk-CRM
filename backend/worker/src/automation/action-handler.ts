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

export interface ActionSpec {
  actionType: string;
  params: Record<string, unknown>;
}

export type CaseManagementEntityRef = { entityType: 'CLAIM'; claimId: string } | { entityType: 'CASE'; caseId: string };

export interface AutomationActionContext {
  entity: CaseManagementEntityRef;
  /** Always null here — every action run through this registry is fired by a background AutomationRule, never a human request. */
  actingUserId: string | null;
  /** Flows into Activity.createdBySystemJob for ADD_INTERNAL_NOTE — identifies which automation rule/job produced the note. */
  systemJobName: string | null;
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
