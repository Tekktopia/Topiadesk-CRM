'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import { CASE_PRIORITIES, CASE_STATUSES, CLAIM_STATUSES, MACRO_ACTION_TYPES, casePriorityLabel, humanize, macroActionTypeLabel } from '../../_lib/constants';
import { useDirectoryUsers } from '../../_lib/hooks';
import type { ActionSpec, CaseManagementEntityType, MacroActionType } from '../../_lib/types';

export interface DraftAction {
  key: string;
  actionType: MacroActionType;
  params: Record<string, unknown>;
}

export function blankDraftAction(): DraftAction {
  return { key: crypto.randomUUID(), actionType: 'ADD_INTERNAL_NOTE', params: {} };
}

export function draftActionsToActionSpecs(actions: DraftAction[]): ActionSpec[] {
  return actions.map(({ actionType, params }) => ({ actionType, params }));
}

export function actionSpecsToDraftActions(actions: ActionSpec[]): DraftAction[] {
  return actions.map((a) => ({ key: crypto.randomUUID(), actionType: a.actionType as MacroActionType, params: a.params }));
}

/**
 * Structured per-action-type form, one row per action in Macro.actions —
 * param field names match backend/api/.../automation/handlers.ts's
 * registered handlers exactly (SET_STATUS: {status}, ASSIGN_TO_USER:
 * {userId}, ASSIGN_TO_TEAM: {teamId}, SET_PRIORITY: {priority},
 * ADD_INTERNAL_NOTE: {body, subject?}, SEND_NOTIFICATION: {title, body,
 * recipientUserId?}) so a macro built here actually executes correctly,
 * not just a guess at the shape. No raw-JSON fallback needed — all six
 * registered action types have a small enough params shape to model
 * directly.
 */
export function MacroActionsBuilder({
  entityType,
  actions,
  onChange,
}: {
  entityType: CaseManagementEntityType | '';
  actions: DraftAction[];
  onChange: (actions: DraftAction[]) => void;
}) {
  function update(key: string, patch: Partial<DraftAction>) {
    onChange(actions.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <ActionRow
          key={action.key}
          entityType={entityType}
          action={action}
          onChangeType={(actionType) => update(action.key, { actionType, params: {} })}
          onChangeParams={(params) => update(action.key, { params })}
          onRemove={() => onChange(actions.filter((a) => a.key !== action.key))}
        />
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...actions, blankDraftAction()])}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add action
      </Button>
    </div>
  );
}

function ActionRow({
  entityType,
  action,
  onChangeType,
  onChangeParams,
  onRemove,
}: {
  entityType: CaseManagementEntityType | '';
  action: DraftAction;
  onChangeType: (actionType: MacroActionType) => void;
  onChangeParams: (params: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={action.actionType} onValueChange={(v) => onChangeType(v as MacroActionType)}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MACRO_ACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {macroActionTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove action" className="mt-5">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
      <ActionParamsFields entityType={entityType} action={action} onChangeParams={onChangeParams} />
    </div>
  );
}

function ActionParamsFields({
  entityType,
  action,
  onChangeParams,
}: {
  entityType: CaseManagementEntityType | '';
  action: DraftAction;
  onChangeParams: (params: Record<string, unknown>) => void;
}) {
  const { users } = useDirectoryUsers();
  const params = action.params;
  const set = (key: string, value: unknown) => onChangeParams({ ...params, [key]: value });

  switch (action.actionType) {
    case 'SET_STATUS': {
      const statusOptions = entityType === 'CLAIM' ? CLAIM_STATUSES : entityType === 'CASE' ? CASE_STATUSES : [...new Set([...CLAIM_STATUSES, ...CASE_STATUSES])];
      return (
        <div className="space-y-1">
          <Label className="text-xs">New status</Label>
          <Select value={(params.status as string) ?? ''} onValueChange={(v) => set('status', v)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select a status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case 'ASSIGN_TO_USER':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Assign to</Label>
          <Select value={(params.userId as string) ?? ''} onValueChange={(v) => set('userId', v)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'ASSIGN_TO_TEAM':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Team ID (UUID)</Label>
          <Input className="h-8" value={(params.teamId as string) ?? ''} onChange={(e) => set('teamId', e.target.value)} placeholder="No team lookup exposed yet — paste a team UUID" />
        </div>
      );
    case 'SET_PRIORITY':
      return (
        <div className="space-y-1">
          <Label className="text-xs">New priority</Label>
          <Select value={(params.priority as string) ?? ''} onValueChange={(v) => set('priority', v)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select a priority" />
            </SelectTrigger>
            <SelectContent>
              {CASE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {casePriorityLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'ADD_INTERNAL_NOTE':
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Subject (optional)</Label>
            <Input className="h-8" value={(params.subject as string) ?? ''} onChange={(e) => set('subject', e.target.value)} placeholder="Automated note" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Note body</Label>
            <Input value={(params.body as string) ?? ''} onChange={(e) => set('body', e.target.value)} placeholder="e.g. Escalated per SLA breach" />
          </div>
        </div>
      );
    case 'SEND_NOTIFICATION':
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input className="h-8" value={(params.title as string) ?? ''} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Recipient (optional — defaults to the assignee)</Label>
            <Select value={(params.recipientUserId as string) ?? '__default'} onValueChange={(v) => set('recipientUserId', v === '__default' ? undefined : v)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default">Current assignee</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Message</Label>
            <Input value={(params.body as string) ?? ''} onChange={(e) => set('body', e.target.value)} />
          </div>
        </div>
      );
    default:
      return null;
  }
}
