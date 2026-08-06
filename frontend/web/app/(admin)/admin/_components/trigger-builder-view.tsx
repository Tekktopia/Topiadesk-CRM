'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Bell, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@topiadesk/ui';
import { useDirectoryUsers, useTeams } from '../../../(cases)/_lib/hooks';
import { apiFetch } from '../_lib/api';
import { PageHeader } from './page-header';
import { ErrorState } from './query-states';
import type { AutomationRuleDto, CreateAutomationRuleBody, UpdateAutomationRuleBody } from '../_lib/types';

// RenewalSchedule.alertThresholds defaults to exactly these four (days
// before renewalDueDate) — see packages/db/prisma/schema.prisma and
// renewal-panel.tsx's editor. A rule with no thresholds selected fires at
// every threshold crossing (RenewalPlaybookConditions.thresholds omitted —
// see backend/worker/src/jobs/renewal-alerts/renewal-playbook.ts).
const THRESHOLD_OPTIONS = [90, 60, 30, 7];

type ActionKind = 'CREATE_TASK' | 'NOTIFY';

const ACTION_KIND_META: Record<ActionKind, { label: string; icon: typeof ListChecks; description: string }> = {
  CREATE_TASK: { label: 'Create a task', icon: ListChecks, description: 'Creates a follow-up Task linked to the policy and account.' },
  NOTIFY: { label: 'Send a notification', icon: Bell, description: 'Sends an in-app and/or email notification to a person or team.' },
};

interface BuilderAction {
  id: string;
  kind: ActionKind;
  taskTitle?: string;
  taskDescription?: string;
  dueInDays?: number;
  assigneeId?: string;
  notifyTarget?: 'PERSON' | 'TEAM';
  notifyUserId?: string;
  notifyTeamId?: string;
  notifyTitle?: string;
  notifyBody?: string;
  notifyChannel?: 'IN_APP' | 'EMAIL';
}

interface RawAction {
  actionType?: string;
  params?: Record<string, unknown>;
}

function newAction(kind: ActionKind): BuilderAction {
  return { id: crypto.randomUUID(), kind, dueInDays: 3, notifyTarget: 'PERSON', notifyChannel: 'IN_APP' };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Best-effort parse of an existing rule's `actions` JSON back into builder
 * form state — anything that isn't CREATE_TASK or SEND_NOTIFICATION (the
 * only two action types this domain's execution context — the fake
 * placeholder `ctx.entity` in renewal-playbook.ts — can safely run; see
 * that file's header comment and action-handler.ts's SET_STATUS/
 * ASSIGN_TO_USER/etc, which all dereference ctx.entity and would throw
 * against it) is silently dropped rather than crashing the edit page.
 */
function deserializeActions(raw: unknown): BuilderAction[] {
  if (!Array.isArray(raw)) return [];
  const out: BuilderAction[] = [];
  for (const entry of raw as RawAction[]) {
    const p = entry.params ?? {};
    if (entry.actionType === 'CREATE_TASK') {
      out.push({
        id: crypto.randomUUID(),
        kind: 'CREATE_TASK',
        taskTitle: str(p.title),
        taskDescription: str(p.description),
        dueInDays: typeof p.dueInDays === 'number' ? p.dueInDays : 3,
        assigneeId: str(p.assigneeId),
      });
    } else if (entry.actionType === 'SEND_NOTIFICATION') {
      const teamId = str(p.recipientTeamId);
      out.push({
        id: crypto.randomUUID(),
        kind: 'NOTIFY',
        notifyTarget: teamId ? 'TEAM' : 'PERSON',
        notifyUserId: str(p.recipientUserId),
        notifyTeamId: teamId,
        notifyTitle: str(p.title),
        notifyBody: str(p.body),
        notifyChannel: p.channel === 'EMAIL' ? 'EMAIL' : 'IN_APP',
      });
    }
  }
  return out;
}

// Only ever includes `assigneeId` when the admin picked one explicitly —
// renewal-playbook.ts's runRenewalPlaybooks already fills in the renewal's
// own assignee/broker-of-record as the default (`resolvedParams.assigneeId`),
// and rule-authored params win over that default only if actually set here.
function serializeAction(action: BuilderAction): RawAction | null {
  if (action.kind === 'CREATE_TASK') {
    if (!action.taskTitle) return null;
    const params: Record<string, unknown> = { title: action.taskTitle, dueInDays: action.dueInDays ?? 3 };
    if (action.taskDescription) params.description = action.taskDescription;
    if (action.assigneeId) params.assigneeId = action.assigneeId;
    return { actionType: 'CREATE_TASK', params };
  }
  // NOTIFY — a recipient is required (never omitted): SEND_NOTIFICATION's
  // handler only falls back to the triggering record's assignee when no
  // recipient is given, and this trigger domain has no real record behind
  // ctx.entity to fall back to (see this file's header comment) — an
  // unaddressed notification here would silently fail every time.
  const recipientId = action.notifyTarget === 'TEAM' ? action.notifyTeamId : action.notifyUserId;
  if (!recipientId || !action.notifyTitle || !action.notifyBody) return null;
  const params: Record<string, unknown> = {
    title: action.notifyTitle,
    body: action.notifyBody,
    channel: action.notifyChannel ?? 'IN_APP',
  };
  if (action.notifyTarget === 'TEAM') params.recipientTeamId = recipientId;
  else params.recipientUserId = recipientId;
  return { actionType: 'SEND_NOTIFICATION', params };
}

/**
 * Structured, no-code builder for Renewal Playbook triggers — the
 * RENEWAL_SCHEDULE half of AutomationRule.triggerType === 'ENTITY_EVENT'
 * (see triggers-list-view.tsx for the other half, Ticket/Claim workflows,
 * which already got this treatment in workflow-builder-view.tsx). Replaces
 * the raw JSON-textarea dialog for this one domain — conditions/actions
 * still land in exactly the same AutomationRule.conditions/actions columns
 * runRenewalPlaybooks() (backend/worker/src/jobs/renewal-alerts/
 * renewal-playbook.ts) already reads; a rule saved here takes effect on the
 * very next renewal-scan tick (runs every ~15 minutes), no restart needed.
 *
 * Deliberately only exposes CREATE_TASK and SEND_NOTIFICATION — the only
 * two action-handler.ts entries that don't dereference ctx.entity (or, for
 * SEND_NOTIFICATION, only do so as a fallback this builder always avoids by
 * requiring a recipient) — see action-handler.ts's SET_STATUS/
 * ASSIGN_TO_USER/ASSIGN_TO_TEAM/ADD_INTERNAL_NOTE, all of which assume a
 * real Case/Claim behind ctx.entity that doesn't exist for a renewal-driven
 * rule. Exposing those here would build working-looking UI for actions that
 * silently no-op (caught + logged, never surfaced) every time the rule
 * fires.
 */
export function TriggerBuilderView({ ruleId }: { ruleId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = Boolean(ruleId);

  const ruleQuery = useQuery({
    queryKey: ['admin', 'automation-rules', 'one', ruleId],
    queryFn: () => apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${ruleId}`),
    enabled: isEdit,
  });

  const { usersById } = useDirectoryUsers();
  const users = Array.from(usersById.values());
  const { teams } = useTeams();

  const [name, setName] = useState('');
  const [thresholds, setThresholds] = useState<number[]>([]);
  const [lineOfBusiness, setLineOfBusiness] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [actions, setActions] = useState<BuilderAction[]>([]);

  useEffect(() => {
    const rule = ruleQuery.data;
    if (!rule) return;
    setName(rule.name);
    setIsActive(rule.isActive);
    const conditions = (rule.conditions ?? {}) as { thresholds?: number[]; filters?: { lineOfBusiness?: string } };
    setThresholds(Array.isArray(conditions.thresholds) ? conditions.thresholds : []);
    setLineOfBusiness(conditions.filters?.lineOfBusiness ?? '');
    setActions(deserializeActions(rule.actions));
  }, [ruleQuery.data]);

  function toggleThreshold(value: number) {
    setThresholds((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value].sort((a, b) => b - a)));
  }

  function updateAction(id: string, patch: Partial<BuilderAction>) {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeAction(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }

  function moveAction(id: string, direction: -1 | 1) {
    setActions((prev) => {
      const index = prev.findIndex((a) => a.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  function buildPayload(): { conditions: unknown; actions: unknown[] } {
    const filters: Record<string, string> = {};
    if (lineOfBusiness.trim()) filters.lineOfBusiness = lineOfBusiness.trim();
    const conditions = {
      entityType: 'RENEWAL_SCHEDULE',
      thresholds: thresholds.length > 0 ? thresholds : undefined,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
    const serializedActions = actions.map(serializeAction).filter((a): a is RawAction => a !== null);
    return { conditions, actions: serializedActions };
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateAutomationRuleBody) => apiFetch<AutomationRuleDto>('/api/crm/automation-rules', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Trigger created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] });
      router.push('/admin/triggers');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create trigger'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateAutomationRuleBody) =>
      apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Trigger saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] });
      router.push('/admin/triggers');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save trigger'),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const { actions: serializedPreview } = buildPayload();
  const canSubmit = name.trim().length > 0 && serializedPreview.length > 0 && serializedPreview.length === actions.length;

  function handleSubmit() {
    const { conditions, actions: serializedActions } = buildPayload();
    if (isEdit) {
      updateMutation.mutate({ name, triggerType: 'ENTITY_EVENT', conditions, actions: serializedActions, isActive });
    } else {
      createMutation.mutate({ name, triggerType: 'ENTITY_EVENT', conditions, actions: serializedActions, isActive });
    }
  }

  if (isEdit && ruleQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isEdit && ruleQuery.isError) {
    return <ErrorState error={ruleQuery.error} />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={isEdit ? 'Edit trigger' : 'New trigger'}
        description="Reacts to a policy renewal crossing an alert threshold — evaluated by the Renewal Playbooks job (runs every ~15 minutes). No JSON required."
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Name</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="trigger-name">Name</Label>
            <Input id="trigger-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 30-day property renewal follow-up" required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. When</CardTitle>
          <CardDescription>Which renewal alert threshold(s) should fire this trigger. Leave none selected to fire at every threshold.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {THRESHOLD_OPTIONS.map((t) => (
              <Button key={t} type="button" size="sm" variant={thresholds.includes(t) ? 'default' : 'outline'} onClick={() => toggleThreshold(t)}>
                {t} days out
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trigger-lob">Line of business (optional)</Label>
            <Input
              id="trigger-lob"
              value={lineOfBusiness}
              onChange={(e) => setLineOfBusiness(e.target.value)}
              placeholder="e.g. Property — leave blank to match every line of business"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Then</CardTitle>
          <CardDescription>Runs in order, every time the trigger fires.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No actions yet — add one below.</p>
          ) : (
            <ol className="space-y-3">
              {actions.map((action, index) => (
                <ActionEditor
                  key={action.id}
                  action={action}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === actions.length - 1}
                  users={users}
                  teams={teams}
                  onChange={(patch) => updateAction(action.id, patch)}
                  onRemove={() => removeAction(action.id)}
                  onMoveUp={() => moveAction(action.id, -1)}
                  onMoveDown={() => moveAction(action.id, 1)}
                />
              ))}
            </ol>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {(Object.keys(ACTION_KIND_META) as ActionKind[]).map((kind) => {
              const meta = ACTION_KIND_META[kind];
              return (
                <Button key={kind} type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setActions((prev) => [...prev, newAction(kind)])}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {meta.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active — takes effect on the next renewal-scan tick
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/triggers')}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit || isPending} onClick={handleSubmit}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create trigger'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActionEditor({
  action,
  index,
  isFirst,
  isLast,
  users,
  teams,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: BuilderAction;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  users: { id: string; fullName: string }[];
  teams: { id: string; name: string }[];
  onChange: (patch: Partial<BuilderAction>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta = ACTION_KIND_META[action.kind];
  const Icon = meta.icon;

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-secondary text-xs font-medium text-secondary-foreground">{index + 1}</span>
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={onMoveUp} aria-label="Move action up">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={onMoveDown} aria-label="Move action down">
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove} aria-label="Remove action">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {action.kind === 'CREATE_TASK' ? (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Task title</Label>
              <Input value={action.taskTitle ?? ''} onChange={(e) => onChange({ taskTitle: e.target.value })} placeholder="e.g. Call client about upcoming renewal" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description (optional)</Label>
              <Input value={action.taskDescription ?? ''} onChange={(e) => onChange({ taskDescription: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Due in (days)</Label>
              <Input
                type="number"
                min={0}
                value={action.dueInDays ?? 3}
                onChange={(e) => onChange({ dueInDays: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assignee (optional)</Label>
              <Select value={action.assigneeId || '__default'} onValueChange={(v) => onChange({ assigneeId: v === '__default' ? undefined : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">Defaults to the renewal&apos;s assignee</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}

        {action.kind === 'NOTIFY' ? (
          <>
            <div className="space-y-1.5">
              <Label>Notify</Label>
              <Select
                value={action.notifyTarget ?? 'PERSON'}
                onValueChange={(v) => onChange({ notifyTarget: v as 'PERSON' | 'TEAM', notifyUserId: undefined, notifyTeamId: undefined })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSON">A person</SelectItem>
                  <SelectItem value="TEAM">A team</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {action.notifyTarget === 'TEAM' ? (
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Select value={action.notifyTeamId ?? ''} onValueChange={(v) => onChange({ notifyTeamId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Person</Label>
                <Select value={action.notifyUserId ?? ''} onValueChange={(v) => onChange({ notifyUserId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a person" />
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
            )}
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={action.notifyChannel ?? 'IN_APP'} onValueChange={(v) => onChange({ notifyChannel: v as 'IN_APP' | 'EMAIL' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_APP">In-app</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={action.notifyTitle ?? ''} onChange={(e) => onChange({ notifyTitle: e.target.value })} placeholder="e.g. Renewal follow-up due" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Message</Label>
              <Input value={action.notifyBody ?? ''} onChange={(e) => onChange({ notifyBody: e.target.value })} placeholder="What should the notification say?" />
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
