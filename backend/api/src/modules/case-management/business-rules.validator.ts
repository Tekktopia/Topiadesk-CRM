import { BadRequestException } from '@nestjs/common';
import { getPrismaClient, type BusinessRule, type CaseManagementEntityType } from '@topiadesk/db';

/**
 * Condition fields are the case/claim subset a BusinessRule may branch on.
 * (These used to mirror run-engine.ts's own hardcoded CONDITION_FIELDS map;
 * that map is now derived from the shared @topiadesk/automation entity
 * registry, which is a superset — an AutomationRule can branch on more
 * fields than a BusinessRule. The overlap still agrees on meaning, which is
 * what mattered; a BusinessRule is simply the narrower surface.) Action fields are a
 * different domain: every field frontend/web/app/(cases)/cases/_components/
 * case-form-dialog.tsx actually renders, since REQUIRE/HIDE/READONLY only
 * make sense on a field the form shows. CLAIM's action list is empty on
 * purpose — there's no claim-form-dialog.tsx yet, so a CLAIM rule's
 * SET_VALUE/REQUIRE actions would have nothing to target; the frontend
 * mirror of these two lists lives in frontend/web/app/(cases)/_lib/types.ts,
 * kept in sync by hand — a field added to one without the other means the
 * admin UI offers an option the server then rejects, or vice versa.
 */
export const CONDITION_FIELDS: Record<CaseManagementEntityType, readonly string[]> = {
  CASE: ['status', 'priority', 'caseType', 'categoryId', 'assignedTeamId'],
  CLAIM: ['status', 'priority', 'assignedTeamId'],
  // Business rules don't support LEAD (see this file's header comment) —
  // present so this stays a total Record over the shared enum, same "empty
  // but representable" precedent as CLAIM's own ACTION_FIELDS below.
  LEAD: [],
  // Added to CaseManagementEntityType so AutomationRunState can carry a
  // multi-step workflow on any entity type. BusinessRule is a form-behaviour
  // engine over the case/claim forms and models none of them, so they are
  // empty here for exactly the reason LEAD is — an admin cannot author a
  // business rule against them, and this map stays total over the enum.
  POLICY: [],
  OPPORTUNITY: [],
  TASK: [],
  ACCOUNT: [],
  CONTACT: [],
};

export const ACTION_FIELDS: Record<CaseManagementEntityType, readonly string[]> = {
  CASE: ['caseType', 'subject', 'description', 'priority', 'categoryId', 'accountId', 'policyId', 'assignedToId'],
  CLAIM: [],
  LEAD: [],
  POLICY: [],
  OPPORTUNITY: [],
  TASK: [],
  ACCOUNT: [],
  CONTACT: [],
};

export type BusinessRuleActionEffect = 'REQUIRE' | 'HIDE' | 'READONLY' | 'SET_VALUE';

export interface BusinessRuleAction {
  field: string;
  effect: BusinessRuleActionEffect;
  value?: string;
}

function parseActions(raw: unknown): BusinessRuleAction[] {
  if (!Array.isArray(raw)) return [];
  return raw as BusinessRuleAction[];
}

/**
 * Evaluates every active BusinessRule for `entityType` against
 * `{...existingRow, ...data}`, in `displayOrder`. A matching rule's
 * SET_VALUE actions are applied into `data` immediately (so a later rule's
 * condition — and this same rule's own REQUIRE actions — see the mutation,
 * supporting an intentional cascade deterministically via ordering), then
 * that rule's REQUIRE actions are checked against the now-current merged
 * state; the first unsatisfied REQUIRE throws. HIDE/READONLY are not
 * re-validated here — those are client-UX concerns (same "advisory" tier as
 * crm/duplicate-detection.ts), only REQUIRE/SET_VALUE affect data integrity.
 *
 * Called from cases.controller.ts's create()/update()/changeStatus() —
 * `existingRow` is undefined on create (nothing to merge defaults from yet).
 */
export async function validateBusinessRules(
  entityType: CaseManagementEntityType,
  existingRow: Record<string, unknown> | undefined,
  data: Record<string, unknown>,
): Promise<void> {
  const rules = (await getPrismaClient().businessRule.findMany({
    where: { entityType, isActive: true },
    orderBy: { displayOrder: 'asc' },
  })) as BusinessRule[];
  if (rules.length === 0) return;

  const conditionFields = CONDITION_FIELDS[entityType];
  const actionFields = ACTION_FIELDS[entityType];
  const merged: Record<string, unknown> = { ...existingRow, ...data };

  for (const rule of rules) {
    if (!conditionFields.includes(rule.conditionField)) {
      // Should never happen if the admin UI only offers allow-listed
      // fields — fail closed rather than silently ignore a misconfigured
      // rule, since it means something bypassed that UI.
      throw new BadRequestException(`Business rule "${rule.name}" has an invalid condition field for ${entityType}`);
    }

    const actual = String(merged[rule.conditionField] ?? '');
    const matches = rule.conditionOperator === 'EQUALS' ? actual === rule.conditionValue : actual !== rule.conditionValue;
    if (!matches) continue;

    const actions = parseActions(rule.actions);
    for (const action of actions) {
      if (!actionFields.includes(action.field)) {
        throw new BadRequestException(`Business rule "${rule.name}" has an invalid action field for ${entityType}`);
      }
    }

    for (const action of actions) {
      if (action.effect !== 'SET_VALUE') continue;
      merged[action.field] = action.value;
      data[action.field] = action.value;
    }

    for (const action of actions) {
      if (action.effect !== 'REQUIRE') continue;
      const value = merged[action.field];
      if (value === null || value === undefined || value === '') {
        throw new BadRequestException(`"${action.field}" is required (business rule: ${rule.name})`);
      }
    }
  }
}
