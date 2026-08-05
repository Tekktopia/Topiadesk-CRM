'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type {
  AutomationRuleDto,
  AutomationTriggerType,
  CreateAutomationRuleBody,
  UpdateAutomationRuleBody,
} from '../_lib/types';

// Example shapes shown as textarea placeholders — not submitted as-is, just
// there so this is usable without cross-referencing the DTO. Mirrors the
// shapes documented on CreateAutomationRuleDto (backend/api/src/modules/crm/
// dto/automation-rule.dto.ts).
const CONDITIONS_PLACEHOLDER = `{
  "entityType": "RENEWAL_SCHEDULE",
  "thresholds": [30, 60, 90],
  "filters": { "lineOfBusiness": "Property" }
}`;

const ACTIONS_PLACEHOLDER = `[
  {
    "actionType": "CREATE_TASK",
    "params": { "title": "Follow up on renewal", "dueInDays": 3 }
  }
]`;

const TRIGGER_TYPE_HELP: Record<AutomationTriggerType, string> = {
  ENTITY_EVENT:
    'Evaluated in real time by the Renewal Playbooks worker job when a RenewalSchedule crosses an alert threshold (see backend/worker/src/jobs/renewal-alerts/renewal-playbook.ts).',
  SCHEDULE:
    'Time-based rules. No scheduled scan job reads these yet in this build — automation-rules.controller.ts is CRUD only — this stores the rule ready for a future scan job to consume it the same way renewal-playbook.ts consumes ENTITY_EVENT rules.',
};

// No dedicated Textarea primitive exists in @topiadesk/ui yet — styled to
// match Input, same approach as admin/settings/generic-setting-dialog.tsx's
// JSON value editor.
const TEXTAREA_CLASS =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Shared create/edit dialog for AutomationRule records, reused by both
 * /admin/triggers (ENTITY_EVENT) and /admin/automations (SCHEDULE) — see
 * automation-rules-list-view.tsx, which renders one of these per page with
 * `triggerType` fixed to that page's half of the Zendesk Triggers/
 * Automations split.
 *
 * `conditions`/`actions` are free-form JSON (see CreateAutomationRuleDto's
 * doc comments), so v1 is a raw-but-validated JSON textarea rather than a
 * visual rule builder — same "generic JSON editor" approach as
 * generic-setting-dialog.tsx uses for org_settings values.
 */
export function AutomationRuleFormDialog({
  target,
  triggerType,
  open,
  onOpenChange,
}: {
  target: 'create' | AutomationRuleDto;
  triggerType: AutomationTriggerType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create';

  const [name, setName] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [actionsText, setActionsText] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [conditionsError, setConditionsError] = useState<string | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) {
      setName(target.name);
      setConditionsText(JSON.stringify(target.conditions, null, 2));
      setActionsText(JSON.stringify(target.actions, null, 2));
      setIsActive(target.isActive);
    } else {
      setName('');
      setConditionsText('');
      setActionsText('');
      setIsActive(true);
    }
    setConditionsError(null);
    setActionsError(null);
  }, [target, isEdit]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules', triggerType] });
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateAutomationRuleBody) =>
      apiFetch<AutomationRuleDto>('/api/crm/automation-rules', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Rule created');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create rule'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateAutomationRuleBody) =>
      apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${isEdit ? target.id : ''}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Rule updated');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update rule'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setConditionsError(null);
    setActionsError(null);

    let conditions: unknown;
    try {
      conditions = JSON.parse(conditionsText);
    } catch {
      setConditionsError('Not valid JSON');
      return;
    }
    if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions)) {
      setConditionsError('Conditions must be a JSON object, e.g. {"entityType": "RENEWAL_SCHEDULE"}');
      return;
    }

    let actions: unknown;
    try {
      actions = JSON.parse(actionsText);
    } catch {
      setActionsError('Not valid JSON');
      return;
    }
    if (!Array.isArray(actions)) {
      setActionsError('Actions must be a JSON array, e.g. [{"actionType": "CREATE_TASK", "params": {}}]');
      return;
    }

    if (isEdit) {
      updateMutation.mutate({ name, triggerType, conditions, actions, isActive });
    } else {
      createMutation.mutate({ name, triggerType, conditions, actions, isActive });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const noun = triggerType === 'ENTITY_EVENT' ? 'trigger' : 'automation';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${target.name}` : `New ${noun}`}</DialogTitle>
          <DialogDescription>{TRIGGER_TYPE_HELP[triggerType]}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-conditions">Conditions (JSON object)</Label>
            {/* Example, not submitted — see CONDITIONS_PLACEHOLDER above */}
            <textarea
              id="rule-conditions"
              value={conditionsText}
              onChange={(e) => setConditionsText(e.target.value)}
              placeholder={CONDITIONS_PLACEHOLDER}
              rows={5}
              spellCheck={false}
              className={TEXTAREA_CLASS}
              required
            />
            {conditionsError ? (
              <p className="text-sm text-destructive">{conditionsError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                e.g. {'{ "entityType": "RENEWAL_SCHEDULE", "thresholds": [30, 60, 90] }'}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-actions">Actions (JSON array)</Label>
            {/* Example, not submitted — see ACTIONS_PLACEHOLDER above */}
            <textarea
              id="rule-actions"
              value={actionsText}
              onChange={(e) => setActionsText(e.target.value)}
              placeholder={ACTIONS_PLACEHOLDER}
              rows={5}
              spellCheck={false}
              className={TEXTAREA_CLASS}
              required
            />
            {actionsError ? (
              <p className="text-sm text-destructive">{actionsError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                e.g. {'[{ "actionType": "CREATE_TASK", "params": { "title": "..." } }]'}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || !conditionsText.trim() || !actionsText.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : `Create ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
