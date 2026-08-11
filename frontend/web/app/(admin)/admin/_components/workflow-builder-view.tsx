'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CheckCircle2,
  GitBranch,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  ShieldQuestion,
  StickyNote,
  Trash2,
  UserCog,
  Users2,
} from 'lucide-react';
import {
  Badge,
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
import { SearchableUserPicker, SearchableUserMultiPicker } from './searchable-user-picker';
import { WorkflowExecutionLogPanel } from './workflow-execution-log-panel';
import { WorkflowPreviewPanel } from './workflow-preview-panel';
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
/** Sentinel for "no goto chosen yet" in a <Select> (which can't hold an
 * empty-string item value) — distinct from ANY, which means "match
 * anything" in the Conditions card above. */
const UNSET = '__UNSET__';

export type StepKind =
  | 'ASSIGN_USER'
  | 'ASSIGN_TEAM'
  | 'SET_STATUS'
  | 'SET_PRIORITY'
  | 'ADD_NOTE'
  | 'NOTIFY_PERSON'
  | 'NOTIFY_GROUP'
  | 'APPROVAL'
  | 'CONDITION'
  | 'SEND_EMAIL'
  | 'NOTIFY_TEAMS';

export const STEP_KIND_META: Record<StepKind, { label: string; icon: typeof UserCog; description: string }> = {
  ASSIGN_USER: { label: 'Assign to a person', icon: UserCog, description: 'Sets the assignee directly.' },
  ASSIGN_TEAM: { label: 'Assign to a team', icon: Users2, description: 'Sets the owning team directly.' },
  SET_STATUS: { label: 'Set status', icon: CheckCircle2, description: 'Transitions the record to a new status.' },
  SET_PRIORITY: { label: 'Set priority', icon: CheckCircle2, description: 'Changes the priority level.' },
  ADD_NOTE: { label: 'Add an internal note', icon: StickyNote, description: 'Logs a system-authored note on the record.' },
  NOTIFY_PERSON: { label: 'Notify a person', icon: Bell, description: 'Sends an in-app and/or email notification to one user.' },
  NOTIFY_GROUP: { label: 'Notify a group', icon: Users2, description: 'Notifies every member of a team.' },
  APPROVAL: { label: 'Require approval', icon: ShieldQuestion, description: 'Pauses the workflow until it is approved or rejected.' },
  CONDITION: { label: 'If / else condition', icon: GitBranch, description: 'Branches the workflow based on a field value.' },
  SEND_EMAIL: { label: 'Send an email', icon: Mail, description: "Emails a person, a team, or the ticket/claim's customer." },
  NOTIFY_TEAMS: { label: 'Post to a Teams channel', icon: MessageSquare, description: 'Posts a message via a configured Microsoft Teams webhook connector.' },
};

/** Fixed allow-list of fields a CONDITION step can branch on — mirrors
 * backend/worker/src/automation/run-engine.ts's CONDITION_FIELDS exactly
 * (same set the "Conditions" card above already exposes; no custom-field
 * conditions in this pass). */
const CONDITION_FIELDS_BY_ENTITY: Record<'CASE' | 'CLAIM', string[]> = {
  CASE: ['status', 'priority', 'caseType', 'categoryId', 'assignedTeamId'],
  CLAIM: ['status', 'priority', 'assignedTeamId'],
};
const CONDITION_FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  caseType: 'Ticket type',
  categoryId: 'Category',
  assignedTeamId: 'Assigned team',
};

export interface BuilderStep {
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
  /** Default EXPLICIT (today's behavior — approverUserIds/notifyTeamId
   * below). ASSIGNEE_MANAGER/TEAM_LEAD dynamically resolve the decider
   * from the ticket at gate-open time instead — no picker needed for
   * those two. */
  approverMode?: 'EXPLICIT' | 'ASSIGNEE_MANAGER' | 'TEAM_LEAD';
  /** Named individual approvers (searchable multi-picker) — non-empty
   * turns on decision-time allow-list enforcement server-side. */
  approverUserIds?: string[];
  /** Quorum among approverUserIds. 1 (or unset) = today's single-approver behavior. */
  requiredApprovals?: number;
  /** Step id to jump to once this gate is fully approved/rejected — unset = today's default (approve falls through, reject fails the run). */
  onApproveGoto?: string;
  onRejectGoto?: string;
  conditionField?: string;
  conditionOperator?: 'EQUALS' | 'NOT_EQUALS';
  conditionValue?: string;
  conditionOnTrueGoto?: string;
  conditionOnFalseGoto?: string;
  emailRecipientMode?: 'USER' | 'TEAM' | 'CASE_CUSTOMER';
  emailRecipientUserId?: string;
  emailRecipientTeamId?: string;
  emailSubject?: string;
  emailBody?: string;
  teamsConnectorId?: string;
  teamsTitle?: string;
  teamsBody?: string;
}

interface RawStep {
  id?: string;
  type?: string;
  actionType?: string;
  params?: Record<string, unknown>;
  reason?: string;
  notifyTeamId?: string;
  approverMode?: string;
  approverUserIds?: string[];
  requiredApprovals?: number;
  onApprove?: { goto?: string };
  onReject?: { goto?: string };
  field?: string;
  operator?: string;
  value?: string;
  onTrue?: { goto?: string };
  onFalse?: { goto?: string };
}

function newStep(kind: StepKind): BuilderStep {
  return { id: crypto.randomUUID(), kind, notifyChannel: 'IN_APP', emailRecipientMode: 'USER', conditionOperator: 'EQUALS' };
}

/** Best-effort parse of an existing rule's `steps` JSON back into builder
 * form state. Every step is kept — including ones this builder can't fully
 * render — rather than silently dropped, now that drafts depend on
 * round-tripping partial/unfamiliar data without data loss. A step's `id`
 * is preserved (goto targets address steps by id); older rows predating
 * branching have no `id`, so `step-${index}` is synthesized — the exact
 * same fallback backend/worker's run-engine.ts and the decide() endpoint
 * use, so any (currently nonexistent, since old rules have no goto)
 * cross-reference stays consistent. */
function deserializeSteps(raw: unknown): BuilderStep[] {
  if (!Array.isArray(raw)) return [];
  const out: BuilderStep[] = [];
  (raw as RawStep[]).forEach((entry, index) => {
    const id = entry.id ?? `step-${index}`;
    if (entry.type === 'APPROVAL_GATE') {
      out.push({
        id,
        kind: 'APPROVAL',
        approvalReason: entry.reason,
        approvalNotifyTeamId: entry.notifyTeamId,
        approverMode: entry.approverMode === 'ASSIGNEE_MANAGER' || entry.approverMode === 'TEAM_LEAD' ? entry.approverMode : 'EXPLICIT',
        approverUserIds: entry.approverUserIds,
        requiredApprovals: entry.requiredApprovals,
        onApproveGoto: entry.onApprove?.goto,
        onRejectGoto: entry.onReject?.goto,
      });
      return;
    }
    if (entry.type === 'CONDITION') {
      out.push({
        id,
        kind: 'CONDITION',
        conditionField: entry.field,
        conditionOperator: entry.operator === 'NOT_EQUALS' ? 'NOT_EQUALS' : 'EQUALS',
        conditionValue: entry.value,
        conditionOnTrueGoto: entry.onTrue?.goto,
        conditionOnFalseGoto: entry.onFalse?.goto,
      });
      return;
    }
    if (entry.type !== 'ACTION') return;
    const p = entry.params ?? {};
    switch (entry.actionType) {
      case 'ASSIGN_TO_USER':
        out.push({ id, kind: 'ASSIGN_USER', userId: typeof p.userId === 'string' ? p.userId : undefined });
        break;
      case 'ASSIGN_TO_TEAM':
        out.push({ id, kind: 'ASSIGN_TEAM', teamId: typeof p.teamId === 'string' ? p.teamId : undefined });
        break;
      case 'SET_STATUS':
        out.push({ id, kind: 'SET_STATUS', status: typeof p.status === 'string' ? p.status : undefined });
        break;
      case 'SET_PRIORITY':
        out.push({ id, kind: 'SET_PRIORITY', priority: typeof p.priority === 'string' ? p.priority : undefined });
        break;
      case 'ADD_INTERNAL_NOTE':
        out.push({
          id,
          kind: 'ADD_NOTE',
          noteSubject: typeof p.subject === 'string' ? p.subject : undefined,
          noteBody: typeof p.body === 'string' ? p.body : undefined,
        });
        break;
      case 'SEND_NOTIFICATION':
        out.push({
          id,
          kind: typeof p.recipientTeamId === 'string' ? 'NOTIFY_GROUP' : 'NOTIFY_PERSON',
          userId: typeof p.recipientUserId === 'string' ? p.recipientUserId : undefined,
          teamId: typeof p.recipientTeamId === 'string' ? p.recipientTeamId : undefined,
          notifyTitle: typeof p.title === 'string' ? p.title : undefined,
          notifyBody: typeof p.body === 'string' ? p.body : undefined,
          notifyChannel: p.channel === 'EMAIL' ? 'EMAIL' : 'IN_APP',
        });
        break;
      case 'SEND_EMAIL':
        out.push({
          id,
          kind: 'SEND_EMAIL',
          emailRecipientMode: p.recipientMode === 'TEAM' || p.recipientMode === 'CASE_CUSTOMER' ? p.recipientMode : 'USER',
          emailRecipientUserId: typeof p.recipientUserId === 'string' ? p.recipientUserId : undefined,
          emailRecipientTeamId: typeof p.recipientTeamId === 'string' ? p.recipientTeamId : undefined,
          emailSubject: typeof p.subject === 'string' ? p.subject : undefined,
          emailBody: typeof p.body === 'string' ? p.body : undefined,
        });
        break;
      case 'NOTIFY_TEAMS_CHANNEL':
        out.push({
          id,
          kind: 'NOTIFY_TEAMS',
          teamsConnectorId: typeof p.connectorId === 'string' ? p.connectorId : undefined,
          teamsTitle: typeof p.title === 'string' ? p.title : undefined,
          teamsBody: typeof p.body === 'string' ? p.body : undefined,
        });
        break;
      default:
        break;
    }
  });
  return out;
}

/** Always returns a step (never drops one for being incomplete) — a draft
 * is explicitly allowed to have half-filled steps, so completeness is
 * validated separately (see isStepComplete/canSubmit) rather than baked
 * into serialization. Publishing is what enforces completeness. */
function serializeStep(step: BuilderStep): RawStep {
  switch (step.kind) {
    case 'ASSIGN_USER':
      return { id: step.id, type: 'ACTION', actionType: 'ASSIGN_TO_USER', params: { userId: step.userId } };
    case 'ASSIGN_TEAM':
      return { id: step.id, type: 'ACTION', actionType: 'ASSIGN_TO_TEAM', params: { teamId: step.teamId } };
    case 'SET_STATUS':
      return { id: step.id, type: 'ACTION', actionType: 'SET_STATUS', params: { status: step.status } };
    case 'SET_PRIORITY':
      return { id: step.id, type: 'ACTION', actionType: 'SET_PRIORITY', params: { priority: step.priority } };
    case 'ADD_NOTE':
      return { id: step.id, type: 'ACTION', actionType: 'ADD_INTERNAL_NOTE', params: { subject: step.noteSubject, body: step.noteBody } };
    case 'NOTIFY_PERSON':
      return {
        id: step.id,
        type: 'ACTION',
        actionType: 'SEND_NOTIFICATION',
        params: { title: step.notifyTitle, body: step.notifyBody, recipientUserId: step.userId, channel: step.notifyChannel ?? 'IN_APP' },
      };
    case 'NOTIFY_GROUP':
      return {
        id: step.id,
        type: 'ACTION',
        actionType: 'SEND_NOTIFICATION',
        params: { title: step.notifyTitle, body: step.notifyBody, recipientTeamId: step.teamId, channel: step.notifyChannel ?? 'IN_APP' },
      };
    case 'APPROVAL':
      return {
        id: step.id,
        type: 'APPROVAL_GATE',
        reason: step.approvalReason || undefined,
        notifyTeamId: step.approvalNotifyTeamId || undefined,
        approverMode: step.approverMode && step.approverMode !== 'EXPLICIT' ? step.approverMode : undefined,
        approverUserIds: step.approverUserIds && step.approverUserIds.length > 0 ? step.approverUserIds : undefined,
        requiredApprovals: step.requiredApprovals && step.requiredApprovals > 1 ? step.requiredApprovals : undefined,
        onApprove: step.onApproveGoto ? { goto: step.onApproveGoto } : undefined,
        onReject: step.onRejectGoto ? { goto: step.onRejectGoto } : undefined,
      };
    case 'CONDITION':
      return {
        id: step.id,
        type: 'CONDITION',
        field: step.conditionField,
        operator: step.conditionOperator ?? 'EQUALS',
        value: step.conditionValue ?? '',
        onTrue: { goto: step.conditionOnTrueGoto },
        onFalse: { goto: step.conditionOnFalseGoto },
      };
    case 'SEND_EMAIL':
      return {
        id: step.id,
        type: 'ACTION',
        actionType: 'SEND_EMAIL',
        params: {
          recipientMode: step.emailRecipientMode ?? 'USER',
          recipientUserId: step.emailRecipientMode === 'USER' ? step.emailRecipientUserId : undefined,
          recipientTeamId: step.emailRecipientMode === 'TEAM' ? step.emailRecipientTeamId : undefined,
          subject: step.emailSubject,
          body: step.emailBody,
        },
      };
    case 'NOTIFY_TEAMS':
      return {
        id: step.id,
        type: 'ACTION',
        actionType: 'NOTIFY_TEAMS_CHANNEL',
        params: { connectorId: step.teamsConnectorId, title: step.teamsTitle, body: step.teamsBody },
      };
    default:
      return { id: step.id };
  }
}

/** Publish-time completeness — draft saves skip this entirely. */
function isStepComplete(step: BuilderStep): boolean {
  switch (step.kind) {
    case 'ASSIGN_USER':
      return !!step.userId;
    case 'ASSIGN_TEAM':
      return !!step.teamId;
    case 'SET_STATUS':
      return !!step.status;
    case 'SET_PRIORITY':
      return !!step.priority;
    case 'ADD_NOTE':
      return !!step.noteBody;
    case 'NOTIFY_PERSON':
      return !!(step.userId && step.notifyTitle && step.notifyBody);
    case 'NOTIFY_GROUP':
      return !!(step.teamId && step.notifyTitle && step.notifyBody);
    case 'APPROVAL':
      return true;
    case 'CONDITION':
      // onTrue/onFalse goto are optional (unset = ends the workflow on
      // that branch, see run-engine.ts's AutomationStep doc comment) — a
      // condition only needs its field/value actually chosen to be
      // publishable. Requiring a goto here used to make a CONDITION with
      // no other steps impossible to ever complete (found live).
      return !!(step.conditionField && step.conditionValue);
    case 'SEND_EMAIL':
      return !!(step.emailSubject && step.emailBody && (step.emailRecipientMode === 'CASE_CUSTOMER' || step.emailRecipientUserId || step.emailRecipientTeamId));
    case 'NOTIFY_TEAMS':
      return !!(step.teamsConnectorId && step.teamsTitle && step.teamsBody);
    default:
      return false;
  }
}

/**
 * Full-page structured workflow builder for Ticket/Claim ENTITY_EVENT
 * rules — the JSON-textarea dialog (automation-rule-form-dialog.tsx) stays
 * for Renewal-Playbook (RENEWAL_SCHEDULE) rules, a different trigger
 * domain out of scope here. This builder writes the exact same
 * AutomationRule.conditions/steps shape the worker's run-engine.ts already
 * executes (backend/worker/src/automation/run-engine.ts,
 * automation-events.queue.ts) — publishing a rule here takes effect on the
 * very next matching event, no restart needed (processEntityEvent
 * re-queries active PUBLISHED rules fresh on every event). A DRAFT rule is
 * never matched regardless of isActive, which is what lets autosave run
 * silently in the background without the in-progress rule ever executing.
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
  // Only TEAMS_WEBHOOK connectors are relevant to the NOTIFY_TEAMS step —
  // filtered client-side out of the same connector list
  // /admin/integrations itself reads (backend/api/src/modules/
  // integrations/integrations.controller.ts's list()).
  const { data: connectors } = useQuery({
    queryKey: ['admin', 'integrations', 'connectors'],
    queryFn: () => apiFetch<{ id: string; name: string; connectorType: string; isEnabled: boolean }[]>('/api/admin/integrations/connectors'),
  });
  const teamsWebhookConnectors = useMemo(() => (connectors ?? []).filter((c) => c.connectorType === 'TEAMS_WEBHOOK' && c.isEnabled), [connectors]);

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
  const [ruleStatus, setRuleStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('PUBLISHED');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const initializedRef = useRef(false);

  useEffect(() => {
    const rule = ruleQuery.data;
    if (!rule) return;
    setName(rule.name);
    setIsActive(rule.isActive);
    setRuleStatus((rule.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | undefined) ?? 'PUBLISHED');
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
    initializedRef.current = true;
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
    return { conditions, steps: steps.map(serializeStep) };
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateAutomationRuleBody) => apiFetch<AutomationRuleDto>('/api/crm/automation-rules', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Workflow published');
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

  // Handles both create (new workflow) and update (existing) — status is
  // always forced to DRAFT here regardless of which path runs, and stays
  // on the builder page afterward (redirecting to the edit route for a
  // brand-new rule, via replace so "new" never sits in browser history
  // pointing at a rule that now has a real id) rather than jumping to the
  // list the way Publish does, so the user can keep working.
  const saveDraftMutation = useMutation({
    mutationFn: async (body: CreateAutomationRuleBody) => {
      if (isEdit) return apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify(body) });
      return apiFetch<AutomationRuleDto>('/api/crm/automation-rules', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: (saved) => {
      toast.success('Saved as draft');
      setRuleStatus('DRAFT');
      queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] });
      if (!isEdit) router.replace(`/admin/workflows/${saved.id}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save draft'),
  });

  // Silent — no toast, no navigation, just a small text indicator. Only
  // ever runs for an already-saved rule (isEdit), debounced ~3s after the
  // last edit, and deliberately omits `status` so it never un-publishes a
  // PUBLISHED rule or re-publishes a DRAFT one — only Publish/Save-as-draft
  // change status.
  const autosaveMutation = useMutation({
    mutationFn: (body: UpdateAutomationRuleBody) =>
      apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setSaveState('saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] });
    },
    onError: () => setSaveState('idle'),
  });

  const payloadKey = useMemo(() => JSON.stringify(buildPayload()), [entityType, eventTypes, status, priority, caseType, categoryId, assignedTeamId, steps]);

  useEffect(() => {
    if (!isEdit || !initializedRef.current || !name.trim()) return;
    setSaveState('saving');
    const timeout = setTimeout(() => {
      const { conditions, steps: serializedSteps } = buildPayload();
      autosaveMutation.mutate({ name, triggerType: 'ENTITY_EVENT', conditions, actions: [], steps: serializedSteps, isActive });
    }, 3000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, name, isActive, payloadKey]);

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isSavingDraft = saveDraftMutation.isPending;
  const canSaveDraft = name.trim().length > 0;
  const canSubmit = name.trim().length > 0 && eventTypes.length > 0 && steps.length > 0 && steps.every(isStepComplete);

  function handlePublish() {
    const { conditions, steps: serializedSteps } = buildPayload();
    if (isEdit) {
      updateMutation.mutate({ name, triggerType: 'ENTITY_EVENT', conditions, actions: [], steps: serializedSteps, isActive, status: 'PUBLISHED' });
    } else {
      createMutation.mutate({ name, triggerType: 'ENTITY_EVENT', conditions, actions: [], steps: serializedSteps, isActive, status: 'PUBLISHED' });
    }
  }

  function handleSaveDraft() {
    const { conditions, steps: serializedSteps } = buildPayload();
    saveDraftMutation.mutate({
      name: name.trim() || 'Untitled workflow',
      triggerType: 'ENTITY_EVENT',
      conditions,
      actions: [],
      steps: serializedSteps,
      isActive: false,
      status: 'DRAFT',
    });
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="space-y-6">
        <PageHeader
          title={isEdit ? `Edit workflow` : 'New workflow'}
          description="A trigger, optional conditions, and an ordered list of steps — publishing it takes effect on the very next matching event."
          actions={
            <div className="flex items-center gap-2">
              {ruleStatus === 'DRAFT' ? <Badge variant="outline">Draft — not running yet</Badge> : null}
              <span className="text-xs text-muted-foreground">
                {isEdit && saveState === 'saving' ? 'Saving…' : null}
                {isEdit && saveState === 'saved' ? 'Saved' : null}
              </span>
            </div>
          }
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
              <Select
                value={entityType}
                onValueChange={(v) => {
                  setEntityType(v as 'CASE' | 'CLAIM');
                  setEventTypes([]);
                  setStatus('');
                  setCaseType('');
                }}
                disabled={isEdit}
              >
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
            <CardDescription>Runs in order (or branches, for conditions/approvals with custom routing) — an approval step pauses the workflow until decided.</CardDescription>
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
                    entityType={entityType}
                    statusOptions={statusOptions}
                    statusLabel={statusLabel}
                    categories={categories ?? []}
                    users={users}
                    teams={teams}
                    teamsWebhookConnectors={teamsWebhookConnectors}
                    allSteps={steps}
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
          <CardContent className="space-y-3 pt-6">
            {ruleStatus === 'DRAFT' && !canSubmit ? (
              <p className="text-xs text-muted-foreground">
                This workflow is still a draft — it won&apos;t run until published. Publish needs a name, at least one trigger event, at least one step, and every step fully filled in.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active — takes effect immediately once published
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => router.push('/admin/workflows')}>
                  Cancel
                </Button>
                <Button type="button" variant="outline" disabled={!canSaveDraft || isSavingDraft} onClick={handleSaveDraft}>
                  {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save as draft
                </Button>
                <Button type="button" disabled={!canSubmit || isPending} onClick={handlePublish}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {isEdit && ruleStatus !== 'DRAFT' ? 'Save changes' : 'Publish workflow'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <WorkflowPreviewPanel entityType={entityType} eventTypes={eventTypes} steps={steps} users={users} teams={teams} />
        {isEdit && ruleId ? <WorkflowExecutionLogPanel ruleId={ruleId} /> : null}
      </div>
    </div>
  );
}

function GotoStepSelect({
  allSteps,
  currentStepId,
  value,
  onChange,
  unsetLabel,
}: {
  allSteps: BuilderStep[];
  currentStepId: string;
  value: string | undefined;
  onChange: (stepId: string | undefined) => void;
  /** Label for the "no explicit target" option — pass null to make a choice required (CONDITION's branches). */
  unsetLabel: string | null;
}) {
  const options = allSteps.filter((s) => s.id !== currentStepId);
  return (
    <Select value={value || UNSET} onValueChange={(v) => onChange(v === UNSET ? undefined : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Choose a step" />
      </SelectTrigger>
      <SelectContent>
        {unsetLabel ? <SelectItem value={UNSET}>{unsetLabel}</SelectItem> : null}
        {options.map((s) => {
          const stepNumber = allSteps.findIndex((x) => x.id === s.id) + 1;
          return (
            <SelectItem key={s.id} value={s.id}>
              {stepNumber}. {STEP_KIND_META[s.kind].label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function StepEditor({
  step,
  index,
  isFirst,
  isLast,
  entityType,
  statusOptions,
  statusLabel,
  categories,
  users,
  teams,
  teamsWebhookConnectors,
  allSteps,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: BuilderStep;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  entityType: 'CASE' | 'CLAIM';
  statusOptions: readonly string[];
  statusLabel: (s: string) => string;
  categories: { id: string; name: string }[];
  users: { id: string; fullName: string }[];
  teams: { id: string; name: string }[];
  teamsWebhookConnectors: { id: string; name: string }[];
  allSteps: BuilderStep[];
  onChange: (patch: Partial<BuilderStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta = STEP_KIND_META[step.kind];
  const Icon = meta.icon;
  const conditionFields = CONDITION_FIELDS_BY_ENTITY[entityType];

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
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Person</Label>
            <SearchableUserPicker users={users} value={step.userId} onChange={(userId) => onChange({ userId })} />
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
              <Label>Who approves</Label>
              <Select value={step.approverMode ?? 'EXPLICIT'} onValueChange={(v) => onChange({ approverMode: v as 'EXPLICIT' | 'ASSIGNEE_MANAGER' | 'TEAM_LEAD' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPLICIT">Specific people (below)</SelectItem>
                  <SelectItem value="ASSIGNEE_MANAGER">The ticket assignee&apos;s manager</SelectItem>
                  <SelectItem value="TEAM_LEAD">The assigned team&apos;s lead</SelectItem>
                </SelectContent>
              </Select>
              {step.approverMode === 'ASSIGNEE_MANAGER' ? (
                <p className="text-xs text-muted-foreground">Resolved at gate-open time from the ticket assignee&apos;s Manager field. Falls back to any Compliance Officer/Admin if the assignee has no manager set.</p>
              ) : step.approverMode === 'TEAM_LEAD' ? (
                <p className="text-xs text-muted-foreground">Resolved at gate-open time from whoever has the Lead role on the ticket&apos;s assigned team. Falls back to any Compliance Officer/Admin if the team has no lead.</p>
              ) : null}
            </div>
            {(!step.approverMode || step.approverMode === 'EXPLICIT') ? (
              <>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Specific approvers (optional)</Label>
                  <SearchableUserMultiPicker
                    users={users}
                    value={step.approverUserIds ?? []}
                    onChange={(approverUserIds) => onChange({ approverUserIds })}
                    placeholder="Anyone who can approve (default) — or name specific people"
                  />
                </div>
                {(step.approverUserIds ?? []).length > 1 ? (
                  <div className="space-y-1.5">
                    <Label>Approvals required</Label>
                    <Input
                      type="number"
                      min={1}
                      max={(step.approverUserIds ?? []).length}
                      value={step.requiredApprovals ?? 1}
                      onChange={(e) => onChange({ requiredApprovals: Math.max(1, Math.min(Number(e.target.value) || 1, (step.approverUserIds ?? []).length)) })}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Also notify (optional)</Label>
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
            <div className="space-y-1.5">
              <Label>On approve, go to</Label>
              <GotoStepSelect allSteps={allSteps} currentStepId={step.id} value={step.onApproveGoto} onChange={(v) => onChange({ onApproveGoto: v })} unsetLabel="Continue to next step (default)" />
            </div>
            <div className="space-y-1.5">
              <Label>On reject, go to</Label>
              <GotoStepSelect allSteps={allSteps} currentStepId={step.id} value={step.onRejectGoto} onChange={(v) => onChange({ onRejectGoto: v })} unsetLabel="End the workflow (default)" />
            </div>
          </>
        ) : null}

        {step.kind === 'CONDITION' ? (
          <>
            <div className="space-y-1.5">
              <Label>If</Label>
              <Select value={step.conditionField ?? ''} onValueChange={(v) => onChange({ conditionField: v, conditionValue: '' })}>
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
            <div className="space-y-1.5">
              <Label>Is</Label>
              <Select value={step.conditionOperator ?? 'EQUALS'} onValueChange={(v) => onChange({ conditionOperator: v as 'EQUALS' | 'NOT_EQUALS' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EQUALS">Equal to</SelectItem>
                  <SelectItem value="NOT_EQUALS">Not equal to</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Value</Label>
              {step.conditionField === 'status' ? (
                <Select value={step.conditionValue ?? ''} onValueChange={(v) => onChange({ conditionValue: v })}>
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
              ) : step.conditionField === 'priority' ? (
                <Select value={step.conditionValue ?? ''} onValueChange={(v) => onChange({ conditionValue: v })}>
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
              ) : step.conditionField === 'caseType' ? (
                <Select value={step.conditionValue ?? ''} onValueChange={(v) => onChange({ conditionValue: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a ticket type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {caseTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : step.conditionField === 'categoryId' ? (
                <Select value={step.conditionValue ?? ''} onValueChange={(v) => onChange({ conditionValue: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : step.conditionField === 'assignedTeamId' ? (
                <Select value={step.conditionValue ?? ''} onValueChange={(v) => onChange({ conditionValue: v })}>
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
              ) : (
                <p className="text-xs text-muted-foreground">Choose a field above first.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>If true, go to</Label>
              <GotoStepSelect allSteps={allSteps} currentStepId={step.id} value={step.conditionOnTrueGoto} onChange={(v) => onChange({ conditionOnTrueGoto: v })} unsetLabel="End the workflow (default)" />
            </div>
            <div className="space-y-1.5">
              <Label>If false, go to</Label>
              <GotoStepSelect allSteps={allSteps} currentStepId={step.id} value={step.conditionOnFalseGoto} onChange={(v) => onChange({ conditionOnFalseGoto: v })} unsetLabel="End the workflow (default)" />
            </div>
          </>
        ) : null}

        {step.kind === 'SEND_EMAIL' ? (
          <>
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <Select value={step.emailRecipientMode ?? 'USER'} onValueChange={(v) => onChange({ emailRecipientMode: v as 'USER' | 'TEAM' | 'CASE_CUSTOMER' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">A specific person</SelectItem>
                  <SelectItem value="TEAM">Every member of a team</SelectItem>
                  <SelectItem value="CASE_CUSTOMER">{entityType === 'CLAIM' ? "The claim's customer" : "The ticket's customer"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {step.emailRecipientMode === 'USER' ? (
              <div className="space-y-1.5">
                <Label>Person</Label>
                <SearchableUserPicker users={users} value={step.emailRecipientUserId} onChange={(userId) => onChange({ emailRecipientUserId: userId })} />
              </div>
            ) : null}
            {step.emailRecipientMode === 'TEAM' ? (
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Select value={step.emailRecipientTeamId ?? ''} onValueChange={(v) => onChange({ emailRecipientTeamId: v })}>
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Subject</Label>
              <Input value={step.emailSubject ?? ''} onChange={(e) => onChange({ emailSubject: e.target.value })} placeholder="e.g. Your ticket has been resolved" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Message</Label>
              <Input value={step.emailBody ?? ''} onChange={(e) => onChange({ emailBody: e.target.value })} placeholder="What should the email say?" />
            </div>
          </>
        ) : null}

        {step.kind === 'NOTIFY_TEAMS' ? (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Teams connector</Label>
              <Select value={step.teamsConnectorId ?? ''} onValueChange={(v) => onChange({ teamsConnectorId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={teamsWebhookConnectors.length > 0 ? 'Choose a connector' : 'No Teams connector configured yet'} />
                </SelectTrigger>
                <SelectContent>
                  {teamsWebhookConnectors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teamsWebhookConnectors.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Set one up under{' '}
                  <a href="/admin/integrations" className="underline" target="_blank" rel="noreferrer">
                    Integrations
                  </a>
                  first.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Title</Label>
              <Input value={step.teamsTitle ?? ''} onChange={(e) => onChange({ teamsTitle: e.target.value })} placeholder="e.g. Urgent ticket needs attention" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Message</Label>
              <Input value={step.teamsBody ?? ''} onChange={(e) => onChange({ teamsBody: e.target.value })} placeholder="What should the Teams message say?" />
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
