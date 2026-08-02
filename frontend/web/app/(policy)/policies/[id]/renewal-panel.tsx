'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { formatDate, formatDateTime, renewalStatusVariant } from '@/app/(policy)/lib/format';
import type { RenewalScheduleDto, UpdateRenewalScheduleDto, UserOption } from '@/app/(policy)/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const RENEWAL_STATUSES = ['ON_TRACK', 'AT_RISK', 'IN_PROGRESS', 'RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'] as const;
const UNASSIGNED = 'UNASSIGNED';

/** Renewal schedule display + the user-override surface the brief calls
 * for: reassigning who chases the renewal and tuning alert thresholds
 * (`nextAlertDueAt` is recomputed server-side, never client-settable —
 * see renewal-schedule.controller.ts). Handles the "no schedule yet" case
 * (GET 404s) with a small creation form instead of erroring. */
export function RenewalPanel({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();
  const scheduleQuery = useQuery({
    queryKey: ['policy-renewal', policyId],
    queryFn: async () => {
      const res = await fetch(`/api/policies/${policyId}/renewal-schedule`, { credentials: 'same-origin' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to load renewal schedule');
      return (await res.json()) as RenewalScheduleDto;
    },
  });
  const usersQuery = useQuery({
    queryKey: ['identity-users'],
    queryFn: () => fetchJson<UserOption[]>('/api/identity-users'),
    staleTime: 5 * 60_000,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['policy-renewal', policyId] });

  if (scheduleQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading renewal schedule…</p>;
  if (scheduleQuery.isError) return <p className="text-sm text-destructive">Couldn&apos;t load the renewal schedule.</p>;

  if (!scheduleQuery.data) {
    return <CreateScheduleForm policyId={policyId} onCreated={invalidate} />;
  }

  return (
    <EditScheduleForm schedule={scheduleQuery.data} policyId={policyId} users={usersQuery.data ?? []} onSaved={invalidate} />
  );
}

function CreateScheduleForm({ policyId, onCreated }: { policyId: string; onCreated: () => void }) {
  const [renewalDueDate, setRenewalDueDate] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/policies/${policyId}/renewal-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renewalDueDate }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to create renewal schedule');
      toast.success('Renewal schedule created.');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create renewal schedule');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <p className="text-sm text-muted-foreground">No renewal schedule configured for this policy yet.</p>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="renewalDueDate">Renewal due date</Label>
            <Input id="renewalDueDate" type="date" value={renewalDueDate} onChange={(e) => setRenewalDueDate(e.target.value)} required />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create schedule'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EditScheduleForm({
  schedule,
  policyId,
  users,
  onSaved,
}: {
  schedule: RenewalScheduleDto;
  policyId: string;
  users: UserOption[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [renewalDueDate, setRenewalDueDate] = React.useState(String(schedule.renewalDueDate).slice(0, 10));
  const [assignedToId, setAssignedToId] = React.useState(schedule.assignedToId ?? UNASSIGNED);
  const [thresholds, setThresholds] = React.useState(schedule.alertThresholds.join(', '));
  // schedule.status is plain `string` on the generated DTO (backend's
  // RenewalScheduleResponseDto omits an explicit swagger enum hint) even
  // though it's always one of RENEWAL_STATUSES at runtime; narrow it for
  // the Select/payload, which need the literal union.
  const [status, setStatus] = React.useState(schedule.status as (typeof RENEWAL_STATUSES)[number]);
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const parsedThresholds = thresholds
        .split(',')
        .map((t) => Number(t.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0);
      const payload: UpdateRenewalScheduleDto = {
        renewalDueDate,
        alertThresholds: parsedThresholds.length > 0 ? parsedThresholds : undefined,
        assignedToId: assignedToId === UNASSIGNED ? undefined : assignedToId,
        status,
      };
      const res = await fetch(`/api/policies/${policyId}/renewal-schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to update renewal schedule');
      toast.success('Renewal schedule updated.');
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update renewal schedule');
    } finally {
      setSubmitting(false);
    }
  }

  const assignedName = users.find((u) => u.id === schedule.assignedToId)?.fullName;

  if (!editing) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <Fact label="Renewal due" value={formatDate(schedule.renewalDueDate)} />
              <Fact label="Status" value={<Badge variant={renewalStatusVariant(schedule.status)}>{schedule.status.replace(/_/g, ' ')}</Badge>} />
              <Fact label="Assigned to" value={assignedName ?? 'Unassigned'} />
              <Fact label="Next alert" value={formatDateTime(schedule.nextAlertDueAt)} />
              <Fact label="Alert thresholds" value={schedule.alertThresholds.map((t) => `${t}d`).join(', ')} />
              <Fact label="Renewal meeting" value={schedule.renewalMeetingDate ? formatDate(schedule.renewalMeetingDate) : 'Not scheduled'} />
              <Fact label="Last alert sent" value={schedule.lastAlertSentAt ? formatDateTime(schedule.lastAlertSentAt) : 'Never'} />
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="renewalDueDate">Renewal due date</Label>
              <Input id="renewalDueDate" type="date" value={renewalDueDate} onChange={(e) => setRenewalDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignedTo">Assigned to</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger id="assignedTo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="thresholds">Alert thresholds (days, comma-separated)</Label>
              <Input id="thresholds" value={thresholds} onChange={(e) => setThresholds(e.target.value)} placeholder="90, 60, 30, 7" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RENEWAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
