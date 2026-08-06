'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Bell, CheckCircle2, Loader2, Plus, ShieldQuestion, StickyNote, Trash2, UserCog, Users2 } from 'lucide-react';
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
import { useDirectoryUsers, useTeams, useCaseCategories } from '../../../(cases)/_lib/hooks';
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES, CLAIM_STATUSES } from '../../../(cases)/_lib/types';
import { casePriorityLabel, caseStatusLabel, caseTypeLabel, claimStatusLabel, humanize } from '../../../(cases)/_lib/constants';
import { apiFetch } from '../_lib/api';
import { PageHeader } from './page-header';
import { ErrorState } from './query-states';
import type { AutomationRuleDto, CreateAutomationRuleBody, UpdateAutomationRuleBody } from '../_lib/types';

// Hand-mirrored from the enqueueEntityEvent(...) call sites in
// backend/api/src/modules/case-management/{cases,claims}.controller.ts —
// there is no shared frontend type for these yet (they're backend-only
// string literals). Confirmed exhaustive via a live-codebase grep, not
// guessed.
const TICKET_EVENT_TYPES = [
  'CREATED',
  'UPDATED',
  'ASSIGNED',
  'STATUS_CHANGED',
  'CLOSURE_REQUESTED',
  'CLOSURE_APPROVED',
  'CLOSURE_REJECTED',
  'CHILD_LINKED',
  'MERGED',
  'MACRO_APPLIED',
] as const;
const CLAIM_EVENT_TYPES = ['CREATED', 'UPDATED', 'STATUS_CHANGED', 'MACRO_APPLIED'] as const;

const EVENT_TYPE_LABEL: Record<string, string> = {
  CREATED: 'Created',
  UPDATED: 'Updated',
  ASSIGNED: 'Assigned',
  STATUS_CHANGED: 'Status changed',
  CLOSURE_REQUESTED: 'Closure requested',
  CLOSURE_APPROVED: 'Closure approved',
  CLOSURE_REJECTED: 'Closure rejected',
  CHILD_LINKED: 'Child ticket linked',
  MERGED: 'Merged',
  MACRO_APPLIED: 'Macro applied',
};

const ANY = '__ANY__';

type StepKind = 'ASSIGN_USER' | 'ASSIGN_TEAM' | 'SET_STATUS' | 'SET_PRIORITY' | 'ADD_NOTE' | 'NOTIFY_PERSON' | 'NOTIFY_GROUP' | 'APPROVAL';

const STEP_KIND_META: Record<StepKind, { label: string; icon: typeof UserCog; description: string }> = {
  ASSIGN_USER: { label: 'Assign to a person', icon: UserCog, description: 'Sets the assignee directly.' },
  ASSIGN_TEAM: { label: 'Assign to a team', icon: Users2, description: 'Sets the owning team directly.' },
  SET_STATUS: { label: 'Set status', icon: CheckCircle2, description: 'Transitions the record to a new status.' },
  SET_PRIORITY: { label: 'Set priority', icon: CheckCircle2, description: 'Changes the priority level.' },
  ADD_NOTE: { label: 'Add an internal note', icon: StickyNote, description: 'Logs a system-authored note on the record.' },
  NOTIFY_PERSON: { label: 'Notify a person', icon: Bell, description: 'Sends an in-app and/or email notification to one user.' },
  NOTIFY_GROUP: { label: 'Notify a group', icon: Users2, description: 'Notifies every member of a team.' },
  APPROVAL: { label: 'Require approval', icon: ShieldQuestion, description: 'Pauses the workflow until a Compliance Officer or Admin decides.' },
};

interface BuilderStep {
  id: string;
  kind: StepKind;
  userId?: string;
  teamId?: string;
  status?: string;
  priority?: string;
  noteSubject?: string;
  noteBody?: string;
  notifyTitle?: string;
  notifyBody?: string;
  notifyChannel?: 'IN_APP' | 'EMAIL';
  approvalReason?: string;
  approvalNotifyTeamId?: string;
}

interface RawStep {
  type?: string;
  actionType?: string;
  params?: Record<string, unknown>;
  reason?: string;
  notifyTeamId?: string;
}

function newStep(kind: StepKind): BuilderStep {
  return { id: crypto.randomUUID(), kind, notifyChannel: 'IN_APP' };
}

/** Best-effort parse of an existing rule's `steps` JSON back into builder
 * form state — anything that doesn't match one of the 8 step kinds this
 * builder knows how to render is silently dropped rather than crashing the
 * edit page (a rule with a step this builder doesn't understand yet is
 * still safely editable for its other steps). */
function deserializeSteps(raw: unknown): BuilderStep[] {
  if (!Array.isArray(raw)) return [];
  const out: BuilderStep[] = [];
  for (const entry of raw as RawStep[]) {
    if (entry.type === 'APPROVAL_GATE') {
      out.push({ id: crypto.randomUUID(), kind: 'APPROVAL', approvalReason: entry.reason, approvalNotifyTeamId: entry.notifyTeamId });
      continue;
    }
    if (entry.type !== 'ACTION') continue;
    const p = entry.params ?? {};
    switch (entry.actionType) {
      case 'ASSIGN_TO_USER':
        out.push({ id: crypto.randomUUID(), kind: 'ASSIGN_USER', userId: typeof p.userId === 'string' ? p.userId : undefined });
        break;
      case 'ASSIGN_TO_TEAM':
        out.push({ id: crypto.randomUUID(), kind: 'ASSIGN_TEAM', teamId: typeof p.teamId === 'string' ? p.teamId : undefined });
        break;
      case 'SET_STATUS':
        out.push({ id: crypto.randomUUID(), kind: 'SET_STATUS', status: typeof p.status === 'string' ? p.status : undefined });
        break;
      case 'SET_PRIORITY':
        out.push({ id: crypto.randomUUID(), kind: 'SET_PRIORITY', priority: typeof p.priority === 'string' ? p.priority : undefined });
        break;
      case 'ADD_INTERNAL_NOTE':
        out.push({
          id: crypto.randomUUID(),
          kind: 'ADD_NOTE',
          noteSubject: typeof p.subject === 'string' ? p.subject : undefined,
          noteBody: typeof p.body === 'string' ? p.body : undefined,
        });
        break;
      case 'SEND_NOTIFICATION':
        out.push({
          id: crypto.randomUUID(),
          kind: typeof p.recipientTeamId === 'string' ? 'NOTIFY_GROUP' : 'NOTIFY_PERSON',
          userId: typeof p.recipientUserId === 'string' ? p.recipientUserId : undefined,
          teamId: typeof p.recipientTeamId === 'string' ? p.recipientTeamId : undefined,
          notifyTitle: typeof p.title === 'string' ? p.title : undefined,
          notifyBody: typeof p.body === 'string' ? p.body : undefined,
          notifyChannel: p.channel === 'EMAIL' ? 'EMAIL' : 'IN_APP',
        });
        break;
      default:
        break;
    }
  }
  return out;
}

function serializeStep(step: BuilderStep): RawStep | null {
  switch (step.kind) {
    case 'ASSIGN_USER':
      return step.userId ? { type: 'ACTION', actionType: 'ASSIGN_TO_USER', params: { userId: step.userId } } : null;
    case 'ASSIGN_TEAM':
      return step.teamId ? { type: 'ACTION', actionType: 'ASSIGN_TO_TEAM', params: { teamId: step.teamId } } : null;
    case 'SET_STATUS':
      return step.status ? { type: 'ACTION', actionType: 'SET_STATUS', params: { status: step.status } } : null;
    case 'SET_PRIORITY':
      return step.priority ? { type: 'ACTION', actionType: 'SET_PRIORITY', params: { priority: step.priority } } : null;
    case 'ADD_NOTE':
      return step.noteBody ? { type: 'ACTION', actionType: 'ADD_INTERNAL_NOTE', params: { subject: step.noteSubject, body: step.noteBody } } : null;
    case 'NOTIFY_PERSON':
      return step.userId && step.notifyTitle && step.notifyBody
        ? {
            type: 'ACTION',
            actionType: 'SEND_NOTIFICATION',
            params: { title: step.notifyTitle, body: step.notifyBody, recipientUserId: step.userId, channel: step.notifyChannel ?? 'IN_APP' },
          }
        : null;
    case 'NOTIFY_GROUP':
      return step.teamId && step.notifyTitle && step.notifyBody
        ? {
            type: 'ACTION',
            actionType: 'SEND_NOTIFICATION',
            params: { title: step.notifyTitle, body: step.notifyBody, recipientTeamId: step.teamId, channel: step.notifyChannel ?? 'IN_APP' },
          }
        : null;
    case 'APPROVAL':
      return { type: 'APPROVAL_GATE', reason: step.approvalReason || undefined, notifyTeamId: step.approvalNotifyTeamId || undefined };
    default:
      return null;
  }
}

/**
 * Full-page structured workflow builder for Ticket/Claim ENTITY_EVENT
 * rules — the JSON-textarea dialog (automation-rule-form-dialog.tsx) stays
 * for Renewal-Playbook (RENEWAL_SCHEDULE) rules, a different trigger
 * domain out of scope here. This builder writes the exact same
 * AutomationRule.conditions/steps shape the worker's run-engine.ts already
 * executes (backend/worker/src/automation/run-engine.ts,
 * automation-events.queue.ts) — activating a rule here takes effect on the
 * very next matching event, no restart needed (processEntityEvent
 * re-queries active rules fresh on every event).
 */
export function WorkflowBuilderView({ ruleId }: { ruleId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = Boolean(ruleId);

  const ruleQuery = useQuery({
    queryKey: ['admin', 'automation-rules', 'one', ruleId],
    queryFn: () => apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${ruleId}`),
    enabled: isEdit,
  });

  const { users } = useDirectoryUsers();
  const { teams } = useTeams();
  const { data: categories } = useCaseCategories();

  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<'CASE' | 'CLAIM'>('CASE');
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [caseType, setCaseType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [assignedTeamId, setAssignedTeamId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<BuilderStep[]>([]);

  useEffect(() => {
    const rule = ruleQuery.data;
    if (!rule) return;
    setName(rule.name);
    setIsActive(rule.isActive);
    const conditions = (rule.conditions ?? {}) as {
      entityType?: 'CASE' | 'CLAIM';
      eventTypes?: string[];
      filters?: Record<string, unknown>;
    };
    setEntityType(conditions.entityType === 'CLAIM' ? 'CLAIM' : 'CASE');
    setEventTypes(conditions.eventTypes ?? []);
    const filters = conditions.filters ?? {};
    setStatus(typeof filters.status === 'string' ? filters.status : '');
    setPriority(typeof filters.priority === 'string' ? filters.priority : '');
    setCaseType(typeof filters.caseType === 'string' ? filters.caseType : '');
    setCategoryId(typeof filters.categoryId === 'string' ? filters.categoryId : '');
    setAssignedTeamId(typeof filters.assignedTeamId === 'string' ? filters.assignedTeamId : '');
    setSteps(deserializeSteps(rule.steps));
  }, [ruleQuery.data]);

  const eventTypeOptions = entityType === 'CASE' ? TICKET_EVENT_TYPES : CLAIM_EVENT_TYPES;
  const statusOptions = entityType === 'CASE' ? CASE_STATUSES : CLAIM_STATUSES;
  const statusLabel = entityType === 'CASE' ? caseStatusLabel : claimStatusLabel;

  function toggleEventType(value: string) {
    setEventTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function updateStep(id: string, patch: Partial<BuilderStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function moveStep(id: string, direction: -1 | 1) {
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  function buildPayload(): { conditions: unknown; steps: unknown[] } {
    const filters: Record<string, string> = {};
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (entityType === 'CASE' && caseType) filters.caseType = caseType;
    if (entityType === 'CASE' && categoryId) filters.categoryId = categoryId;
    if (assignedTeamId) filters.assignedTeamId = assignedTeamId;

    const conditions = { entityType, eventTypes, filters };
    const serializedSteps = steps.map(serializeStep).filter((s): s is RawStep => s !== null);
    return { conditions, steps: serializedSteps };
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateAutomationRuleBody) => apiFetch<AutomationRuleDto>('/api/crm/automation-rules', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Workflow created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] });
      router.push('/admin/workflows');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create workflow'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateAutomationRuleBody) =>
      apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Workflow saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] });
      router.push('/admin/workflows');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save workflow'),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = name.trim().length > 0 && eventTypes.length > 0 && steps.length > 0;

  function handleSubmit() {
    const { conditions, steps: serializedSteps } = buildPayload();
    if (isEdit) {
      updateMutation.mutate({ name, triggerType: 'ENTITY_EVENT', conditions, actions: [], steps: serializedSteps, isActive });
    } else {
      createMutation.mutate({ name, triggerType: 'ENTITY_EVENT', conditions, actions: [], steps: serializedSteps, isActive });
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
        title={isEdit ? `Edit workflow` : 'New workflow'}
        description="A trigger, optional conditions, and an ordered list of steps — activating it takes effect on the very next matching event."
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Name &amp; entity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workflow-name">Name</Label>
            <Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Escalate urgent complaints" required />
          </div>
          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <Select value={entityType} onValueChange={(v) => { setEntityType(v as 'CASE' | 'CLAIM'); setEventTypes([]); setStatus(''); setCaseType(''); }} disabled={isEdit}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASE">Ticket</SelectItem>
                <SelectItem value="CLAIM">Claim</SelectItem>
              </SelectContent>
            </Select>
            {isEdit ? <p className="text-xs text-muted-foreground">Can&apos;t be changed after creation.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Trigger</CardTitle>
          <CardDescription>Which event(s) should evaluate this workflow.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {eventTypeOptions.map((et) => (
            <Button key={et} type="button" size="sm" variant={eventTypes.includes(et) ? 'default' : 'outline'} onClick={() => toggleEventType(et)}>
              {EVENT_TYPE_LABEL[et] ?? humanize(et)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Conditions</CardTitle>
          <CardDescription>Optional — leave as &ldquo;Any&rdquo; to match every event of the selected type(s).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status || ANY} onValueChange={(v) => setStatus(v === ANY ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority || ANY} onValueChange={(v) => setPriority(v === ANY ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {CASE_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {casePriorityLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {entityType === 'CASE' ? (
            <div className="space-y-1.5">
              <Label>Ticket type</Label>
              <Select value={caseType || ANY} onValueChange={(v) => setCaseType(v === ANY ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  {CASE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {caseTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {entityType === 'CASE' ? (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId || ANY} onValueChange={(v) => setCategoryId(v === ANY ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Assigned team</Label>
            <Select value={assignedTeamId || ANY} onValueChange={(v) => setAssignedTeamId(v === ANY ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Steps</CardTitle>
          <CardDescription>Runs in order — an approval step pauses the workflow until decided.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No steps yet — add one below.</p>
          ) : (
            <ol className="space-y-3">
              {steps.map((step, index) => (
                <StepEditor
                  key={step.id}
                  step={step}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === steps.length - 1}
                  statusOptions={statusOptions}
                  statusLabel={statusLabel}
                  users={users}
                  teams={teams}
                  onChange={(patch) => updateStep(step.id, patch)}
                  onRemove={() => removeStep(step.id)}
                  onMoveUp={() => moveStep(step.id, -1)}
                  onMoveDown={() => moveStep(step.id, 1)}
                />
              ))}
            </ol>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {(Object.keys(STEP_KIND_META) as StepKind[]).map((kind) => {
              const meta = STEP_KIND_META[kind];
              return (
                <Button key={kind} type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSteps((prev) => [...prev, newStep(kind)])}>
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
            Active — takes effect immediately on the next matching event
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/workflows')}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit || isPending} onClick={handleSubmit}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create workflow'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepEditor({
  step,
  index,
  isFirst,
  isLast,
  statusOptions,
  statusLabel,
  users,
  teams,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: BuilderStep;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  statusOptions: readonly string[];
  statusLabel: (s: string) => string;
  users: { id: string; fullName: string }[];
  teams: { id: string; name: string }[];
  onChange: (patch: Partial<BuilderStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta = STEP_KIND_META[step.kind];
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
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={onMoveUp} aria-label="Move step up">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={onMoveDown} aria-label="Move step down">
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove} aria-label="Remove step">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {step.kind === 'ASSIGN_USER' || step.kind === 'NOTIFY_PERSON' ? (
          <div className="space-y-1.5">
            <Label>Person</Label>
            <Select value={step.userId ?? ''} onValueChange={(v) => onChange({ userId: v })}>
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
        ) : null}

        {step.kind === 'ASSIGN_TEAM' || step.kind === 'NOTIFY_GROUP' ? (
          <div className="space-y-1.5">
            <Label>Team</Label>
            <Select value={step.teamId ?? ''} onValueChange={(v) => onChange({ teamId: v })}>
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
        ) : null}

        {step.kind === 'SET_STATUS' ? (
          <div className="space-y-1.5">
            <Label>New status</Label>
            <Select value={step.status ?? ''} onValueChange={(v) => onChange({ status: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {step.kind === 'SET_PRIORITY' ? (
          <div className="space-y-1.5">
            <Label>New priority</Label>
            <Select value={step.priority ?? ''} onValueChange={(v) => onChange({ priority: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a priority" />
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
        ) : null}

        {step.kind === 'ADD_NOTE' ? (
          <>
            <div className="space-y-1.5">
              <Label>Subject (optional)</Label>
              <Input value={step.noteSubject ?? ''} onChange={(e) => onChange({ noteSubject: e.target.value })} placeholder="Automated note" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Note</Label>
              <Input value={step.noteBody ?? ''} onChange={(e) => onChange({ noteBody: e.target.value })} placeholder="e.g. Escalated automatically due to priority." />
            </div>
          </>
        ) : null}

        {step.kind === 'NOTIFY_PERSON' || step.kind === 'NOTIFY_GROUP' ? (
          <>
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={step.notifyChannel ?? 'IN_APP'} onValueChange={(v) => onChange({ notifyChannel: v as 'IN_APP' | 'EMAIL' })}>
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
              <Input value={step.notifyTitle ?? ''} onChange={(e) => onChange({ notifyTitle: e.target.value })} placeholder="e.g. Urgent ticket needs attention" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Message</Label>
              <Input value={step.notifyBody ?? ''} onChange={(e) => onChange({ notifyBody: e.target.value })} placeholder="What should the notification say?" />
            </div>
          </>
        ) : null}

        {step.kind === 'APPROVAL' ? (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Reason (optional)</Label>
              <Input value={step.approvalReason ?? ''} onChange={(e) => onChange({ approvalReason: e.target.value })} placeholder="e.g. Needs sign-off before escalating priority" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notify (optional)</Label>
              <Select value={step.approvalNotifyTeamId || ANY} onValueChange={(v) => onChange({ approvalNotifyTeamId: v === ANY ? undefined : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Every Compliance Officer &amp; Admin (default)</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
