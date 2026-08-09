import type { BusinessRule } from './types';

export interface EvaluatedBusinessRules {
  required: Set<string>;
  hidden: Set<string>;
  readonly: Set<string>;
  setValues: Record<string, string>;
}

/**
 * Client-side mirror of backend/api/src/modules/case-management/
 * business-rules.validator.ts's validateBusinessRules — same evaluation
 * semantics (single forward pass over `rules` in displayOrder, a matching
 * rule's SET_VALUE applied into the running `effective` view before later
 * rules/this rule's own REQUIRE are checked, so an intentional cascade is
 * deterministic), kept in sync by hand like every other mirrored shape in
 * this file tree. HIDE/READONLY are accumulated too (the backend doesn't
 * enforce those — client-UX only, see that validator's doc comment).
 *
 * Pure and synchronous on purpose: called from a `useMemo` in
 * case-form-dialog.tsx, keyed on the rules list and the form's *condition*
 * field values only (not every field) — see that file for why re-running
 * this on every keystroke across the whole form would be wasteful.
 */
export function evaluateBusinessRules(rules: BusinessRule[], values: Record<string, unknown>): EvaluatedBusinessRules {
  const required = new Set<string>();
  const hidden = new Set<string>();
  const readonly = new Set<string>();
  const setValues: Record<string, string> = {};
  const effective: Record<string, unknown> = { ...values };

  for (const rule of rules) {
    const actual = String(effective[rule.conditionField] ?? '');
    const matches = rule.conditionOperator === 'EQUALS' ? actual === rule.conditionValue : actual !== rule.conditionValue;
    if (!matches) continue;

    for (const action of rule.actions) {
      if (action.effect !== 'SET_VALUE' || action.value === undefined) continue;
      effective[action.field] = action.value;
      setValues[action.field] = action.value;
    }
    for (const action of rule.actions) {
      if (action.effect === 'REQUIRE') required.add(action.field);
      else if (action.effect === 'HIDE') hidden.add(action.field);
      else if (action.effect === 'READONLY') readonly.add(action.field);
    }
  }

  return { required, hidden, readonly, setValues };
}

/** Mirrors account-form-dialog.tsx's validateCustomFieldValues call-site pattern exactly (toast.error + return, no form.setError) — call from onSubmit before building the create/update payload. */
export function validateBusinessRuleValues(required: Set<string>, values: Record<string, unknown>): string | null {
  for (const field of required) {
    const value = values[field];
    if (value === undefined || value === null || value === '') {
      return `"${field}" is required by a business rule`;
    }
  }
  return null;
}
