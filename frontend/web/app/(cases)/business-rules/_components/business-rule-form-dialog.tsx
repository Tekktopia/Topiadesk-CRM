'use client';

import * as React from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { useCreateBusinessRule, useUpdateBusinessRule } from '../../_lib/hooks';
import {
  BUSINESS_RULE_ACTION_EFFECTS,
  BUSINESS_RULE_ACTION_FIELDS,
  BUSINESS_RULE_CONDITION_FIELDS,
  BUSINESS_RULE_OPERATORS,
  type BusinessRule,
  type BusinessRuleAction,
  type BusinessRuleActionEffect,
  type BusinessRuleOperator,
} from '../../_lib/types';
import { BusinessRuleFieldValueInput } from './business-rule-field-value-input';

const CONDITION_FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  caseType: 'Ticket type',
  categoryId: 'Category',
  assignedTeamId: 'Assigned team',
};

const ACTION_FIELD_LABEL: Record<string, string> = {
  caseType: 'Ticket type',
  subject: 'Subject',
  description: 'Description',
  priority: 'Priority',
  categoryId: 'Category',
  accountId: 'Account',
  policyId: 'Policy',
  assignedToId: 'Assigned to',
};

const ACTION_EFFECT_LABEL: Record<BusinessRuleActionEffect, string> = {
  REQUIRE: 'Require',
  HIDE: 'Hide',
  READONLY: 'Make read-only',
  SET_VALUE: 'Set value to',
};

interface DraftAction extends BusinessRuleAction {
  key: string;
}

function blankDraftAction(defaultField: string): DraftAction {
  return { key: crypto.randomUUID(), field: defaultField, effect: 'REQUIRE' };
}

/**
 * Create/edit dialog — entityType fixed to CASE for v1 (see BusinessRule's
 * schema doc comment: no claim-form-dialog.tsx exists yet for CLAIM rules
 * to have anywhere to show their effect). Condition is a single field/
 * operator/value triple; actions are a repeatable list, mirrored on
 * sla-policy-form-dialog.tsx's DraftTargetsList/TargetRow pattern — plain
 * component state, not react-hook-form, matching that precedent.
 */
export function BusinessRuleFormDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: BusinessRule;
}) {
  const isEdit = Boolean(rule);
  const conditionFields = BUSINESS_RULE_CONDITION_FIELDS.CASE;
  const actionFields = BUSINESS_RULE_ACTION_FIELDS.CASE;

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [conditionField, setConditionField] = React.useState('');
  const [conditionOperator, setConditionOperator] = React.useState<BusinessRuleOperator>('EQUALS');
  const [conditionValue, setConditionValue] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [displayOrder, setDisplayOrder] = React.useState(0);
  const [actions, setActions] = React.useState<DraftAction[]>([]);

  React.useEffect(() => {
    if (!open) return;
    if (rule) {
      setName(rule.name);
      setDescription(rule.description ?? '');
      setConditionField(rule.conditionField);
      setConditionOperator(rule.conditionOperator);
      setConditionValue(rule.conditionValue);
      setIsActive(rule.isActive);
      setDisplayOrder(rule.displayOrder);
      setActions(rule.actions.map((a) => ({ ...a, key: crypto.randomUUID() })));
    } else {
      setName('');
      setDescription('');
      setConditionField('');
      setConditionOperator('EQUALS');
      setConditionValue('');
      setIsActive(true);
      setDisplayOrder(0);
      setActions([]);
    }
  }, [open, rule]);

  const createRule = useCreateBusinessRule();
  const updateRule = useUpdateBusinessRule(rule?.id ?? '');
  const isPending = createRule.isPending || updateRule.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const fieldsWithBothRequireAndHide = new Set(
      Array.from(new Set(actions.map((a) => a.field))).filter(
        (field) => actions.some((a) => a.field === field && a.effect === 'REQUIRE') && actions.some((a) => a.field === field && a.effect === 'HIDE'),
      ),
    );
    const firstConflictingField = fieldsWithBothRequireAndHide.values().next().value;
    if (firstConflictingField) {
      toast.error(`"${ACTION_FIELD_LABEL[firstConflictingField] ?? firstConflictingField}" can't be both required and hidden by the same rule`);
      return;
    }
    if (actions.some((a) => a.effect === 'SET_VALUE' && a.field === conditionField)) {
      toast.error(`Setting "${ACTION_FIELD_LABEL[conditionField] ?? conditionField}" from a rule that also triggers on it can cause it to flip back and forth — pick a different field to set, or a different condition field`);
      return;
    }

    const cleanActions: BusinessRuleAction[] = actions.map(({ key: _key, ...a }) => a);

    if (isEdit) {
      await updateRule.mutateAsync({
        name,
        description: description || undefined,
        conditionField,
        conditionOperator,
        conditionValue,
        actions: cleanActions,
        isActive,
        displayOrder,
      });
    } else {
      await createRule.mutateAsync({
        entityType: 'CASE',
        name,
        description: description || undefined,
        conditionField,
        conditionOperator,
        conditionValue,
        actions: cleanActions,
        isActive,
        displayOrder,
      });
    }
    onOpenChange(false);
  }

  const canSubmit = Boolean(name && conditionField && conditionValue && actions.length > 0 && actions.every((a) => a.field && (a.effect !== 'SET_VALUE' || a.value)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit business rule' : 'New business rule'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this rule.' : 'Applies to Tickets. When the condition matches, the listed field effects apply on the ticket form and are enforced on save.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Escalated tickets need an owner" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-description">Description</Label>
            <Input id="rule-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — shown to other admins" />
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Condition</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">If field</Label>
                <Select value={conditionField} onValueChange={(v) => { setConditionField(v); setConditionValue(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a field" />
                  </SelectTrigger>
                  <SelectContent>
                    {conditionFields.map((f) => (
                      <SelectItem key={f} value={f}>
                        {CONDITION_FIELD_LABEL[f] ?? f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Is</Label>
                <Select value={conditionOperator} onValueChange={(v) => setConditionOperator(v as BusinessRuleOperator)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_RULE_OPERATORS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op === 'EQUALS' ? 'Equal to' : 'Not equal to'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <BusinessRuleFieldValueInput field={conditionField} value={conditionValue} onChange={setConditionValue} />
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Then</p>
            <ActionsList actions={actions} actionFields={actionFields} onChange={setActions} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-order">Order</Label>
              <Input id="rule-order" type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Lower runs first — matters if two rules&rsquo; SET_VALUE actions could conflict.</p>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionsList({
  actions,
  actionFields,
  onChange,
}: {
  actions: DraftAction[];
  actionFields: readonly string[];
  onChange: (actions: DraftAction[]) => void;
}) {
  function update(key: string, patch: Partial<DraftAction>) {
    onChange(actions.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }
  return (
    <div className="space-y-2">
      {actions.map((a) => (
        <ActionRow key={a.key} action={a} actionFields={actionFields} onChange={(patch) => update(a.key, patch)} onRemove={() => onChange(actions.filter((x) => x.key !== a.key))} />
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...actions, blankDraftAction(actionFields[0] ?? '')])}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add effect
      </Button>
    </div>
  );
}

function ActionRow({
  action,
  actionFields,
  onChange,
  onRemove,
}: {
  action: DraftAction;
  actionFields: readonly string[];
  onChange: (patch: Partial<BusinessRuleAction>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-md bg-secondary/40 p-2">
      <div className="space-y-1">
        <Label className="text-xs">Field</Label>
        <Select value={action.field} onValueChange={(v) => onChange({ field: v, value: undefined })}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actionFields.map((f) => (
              <SelectItem key={f} value={f}>
                {ACTION_FIELD_LABEL[f] ?? f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Effect</Label>
        <Select value={action.effect} onValueChange={(v) => onChange({ effect: v as BusinessRuleActionEffect })}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_RULE_ACTION_EFFECTS.map((effect) => (
              <SelectItem key={effect} value={effect}>
                {ACTION_EFFECT_LABEL[effect]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Value</Label>
        {action.effect === 'SET_VALUE' ? (
          <BusinessRuleFieldValueInput field={action.field} value={action.value ?? ''} onChange={(v) => onChange({ value: v })} />
        ) : (
          <p className="pt-2 text-xs text-muted-foreground">—</p>
        )}
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove effect">
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}
