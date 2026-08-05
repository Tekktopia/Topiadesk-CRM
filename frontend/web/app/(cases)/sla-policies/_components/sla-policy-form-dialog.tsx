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
} from '@topiadesk/ui';
import {
  CASE_MANAGEMENT_ENTITY_TYPES,
  CASE_PRIORITIES,
  CASE_TYPES,
  SLA_METRIC_TYPES,
  casePriorityLabel,
  caseTypeLabel,
  humanize,
} from '../../_lib/constants';
import {
  useAddSlaTarget,
  useBusinessHoursCalendars,
  useCreateSlaPolicy,
  useDeleteSlaTarget,
  useSlaPolicy,
  useUpdateSlaPolicy,
} from '../../_lib/hooks';
import type { CaseManagementEntityType, CasePriority, CaseType, CreateSlaTargetInput, SlaMetricType } from '../../_lib/types';

const UNSET = '__unset';

interface DraftTarget extends CreateSlaTargetInput {
  key: string;
}

function blankDraftTarget(): DraftTarget {
  return { key: crypto.randomUUID(), metricType: 'RESOLUTION', targetMinutes: 480 };
}

/**
 * Create/edit dialog for an SLA policy. Create mode builds the target list
 * client-side and submits it inline via CreateSlaPolicyDto.targets; edit
 * mode manages targets live against POST/DELETE
 * /sla-policies/:id/targets[/:targetId] since the backend only accepts
 * inline targets at creation time. Per-target editing after creation isn't
 * wired up (delete + re-add covers it) — this module is admin/config-tier,
 * kept functional rather than gold-plated per the build brief.
 */
export function SlaPolicyFormDialog({
  open,
  onOpenChange,
  policyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId?: string;
}) {
  const isEdit = Boolean(policyId);
  const { data: existing } = useSlaPolicy(policyId);
  const { data: calendars } = useBusinessHoursCalendars();

  const [name, setName] = React.useState('');
  const [entityType, setEntityType] = React.useState<CaseManagementEntityType>('CLAIM');
  const [caseType, setCaseType] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [calendarId, setCalendarId] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [rank, setRank] = React.useState(0);
  const [draftTargets, setDraftTargets] = React.useState<DraftTarget[]>([]);

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setEntityType(existing.entityType);
      setCaseType(existing.caseType ?? '');
      setPriority(existing.priority ?? '');
      setCalendarId(existing.businessHoursCalendarId ?? '');
      setIsActive(existing.isActive);
      setRank(existing.rank);
    } else if (!isEdit) {
      setName('');
      setEntityType('CLAIM');
      setCaseType('');
      setPriority('');
      setCalendarId('');
      setIsActive(true);
      setRank(0);
      setDraftTargets([]);
    }
  }, [open, existing, isEdit]);

  const createPolicy = useCreateSlaPolicy();
  const updatePolicy = useUpdateSlaPolicy(policyId ?? '');
  const addTarget = useAddSlaTarget(policyId ?? '');
  const deleteTarget = useDeleteSlaTarget(policyId ?? '');
  const isPending = createPolicy.isPending || updatePolicy.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit) {
      await updatePolicy.mutateAsync({
        name,
        caseType: (caseType || undefined) as CaseType | undefined,
        priority: (priority || undefined) as CasePriority | undefined,
        businessHoursCalendarId: calendarId || undefined,
        isActive,
        rank,
      });
    } else {
      await createPolicy.mutateAsync({
        name,
        entityType,
        caseType: (caseType || undefined) as CaseType | undefined,
        priority: (priority || undefined) as CasePriority | undefined,
        businessHoursCalendarId: calendarId || undefined,
        isActive,
        rank,
        targets: draftTargets.map(({ key: _key, ...target }) => target),
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit SLA policy' : 'New SLA policy'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this policy and its targets.' : 'Define a response/resolution target set for claims or cases.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sla-name">Name</Label>
            <Input id="sla-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. High priority claims" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v as CaseManagementEntityType)} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_MANAGEMENT_ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {humanize(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Business hours calendar</Label>
              <Select value={calendarId || UNSET} onValueChange={(v) => setCalendarId(v === UNSET ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="24/7 (no calendar)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>24/7 (no calendar)</SelectItem>
                  {(calendars ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ticket type filter</Label>
              <Select value={caseType || UNSET} onValueChange={(v) => setCaseType(v === UNSET ? '' : v)} disabled={entityType !== 'CASE'}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Any</SelectItem>
                  {CASE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {caseTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority filter</Label>
              <Select value={priority || UNSET} onValueChange={(v) => setPriority(v === UNSET ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Any</SelectItem>
                  {CASE_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {casePriorityLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sla-rank">Tiebreak rank</Label>
            <Input
              id="sla-rank"
              type="number"
              value={rank}
              onChange={(e) => setRank(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              When two policies match a case equally specifically (same case type/priority filters), the higher rank wins. Leave at 0 unless you have overlapping policies.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Targets</p>
            {isEdit ? (
              <ExistingTargetsList policyId={policyId!} onAdd={addTarget.mutate} onDelete={(id) => deleteTarget.mutate(id)} />
            ) : (
              <DraftTargetsList targets={draftTargets} onChange={setDraftTargets} />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DraftTargetsList({ targets, onChange }: { targets: DraftTarget[]; onChange: (targets: DraftTarget[]) => void }) {
  function update(key: string, patch: Partial<DraftTarget>) {
    onChange(targets.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }
  return (
    <div className="space-y-2">
      {targets.map((t) => (
        <TargetRow
          key={t.key}
          target={t}
          onChange={(patch) => update(t.key, patch)}
          onRemove={() => onChange(targets.filter((x) => x.key !== t.key))}
        />
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...targets, blankDraftTarget()])}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add target
      </Button>
    </div>
  );
}

function TargetRow({
  target,
  onChange,
  onRemove,
}: {
  target: CreateSlaTargetInput;
  onChange: (patch: Partial<CreateSlaTargetInput>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-md bg-secondary/40 p-2">
      <div className="space-y-1">
        <Label className="text-xs">Metric</Label>
        <Select value={target.metricType} onValueChange={(v) => onChange({ metricType: v as SlaMetricType })}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SLA_METRIC_TYPES.map((m) => (
              <SelectItem key={m} value={m}>
                {humanize(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Target (min)</Label>
        <Input
          className="h-8"
          type="number"
          min={1}
          value={target.targetMinutes}
          onChange={(e) => onChange({ targetMinutes: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Escalate after (min)</Label>
        <Input
          className="h-8"
          type="number"
          min={1}
          value={target.escalateAfterMinutes ?? ''}
          onChange={(e) => onChange({ escalateAfterMinutes: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove target">
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function ExistingTargetsList({
  policyId,
  onAdd,
  onDelete,
}: {
  policyId: string;
  onAdd: (target: CreateSlaTargetInput) => void;
  onDelete: (targetId: string) => void;
}) {
  const { data: policy } = useSlaPolicy(policyId);
  const [draft, setDraft] = React.useState<CreateSlaTargetInput>({ metricType: 'RESOLUTION', targetMinutes: 480 });

  return (
    <div className="space-y-2">
      {(policy?.targets ?? []).map((t) => (
        <div key={t.id} className="flex items-center justify-between rounded-md bg-secondary/40 p-2 text-sm">
          <span>
            {humanize(t.metricType)} · {t.targetMinutes} min
            {t.escalateAfterMinutes ? ` · escalates after ${t.escalateAfterMinutes} min` : ''}
          </span>
          <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(t.id)} aria-label="Remove target">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ))}
      <TargetRow target={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} onRemove={() => setDraft({ metricType: 'RESOLUTION', targetMinutes: 480 })} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          onAdd(draft);
          setDraft({ metricType: 'RESOLUTION', targetMinutes: 480 });
        }}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add target
      </Button>
    </div>
  );
}
