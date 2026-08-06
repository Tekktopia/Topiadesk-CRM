'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@topiadesk/ui';
import { CASE_PRIORITIES, casePriorityLabel, casePriorityVariant, caseStatusLabel, caseStatusVariant } from '../../_lib/constants';
import { formatDuration, summarizeSlaClocks } from '../../_lib/format';
import { useUpdateCase } from '../../_lib/hooks';
import type { Case, CasePriority, SlaClock, UserOption } from '../../_lib/types';
import { useCaseLifecycle } from './use-case-lifecycle';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function relativeTimeFrom(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function TicketPriorityDropdown({ kase }: { kase: Case }) {
  const updateCase = useUpdateCase(kase.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-0.5" disabled={updateCase.isPending}>
          <Badge variant={casePriorityVariant(kase.priority)} className="cursor-pointer gap-1">
            {casePriorityLabel(kase.priority)}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CASE_PRIORITIES.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => updateCase.mutate({ priority: p as CasePriority })}>
            {casePriorityLabel(p)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TicketAssigneeDropdown({ kase, users }: { kase: Case; users: UserOption[] }) {
  const updateCase = useUpdateCase(kase.id);
  const assigneeName = kase.assignedToId ? (users.find((u) => u.id === kase.assignedToId)?.fullName ?? 'Assigned') : 'Unassigned';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" disabled={updateCase.isPending}>
          <span className="truncate">{assigneeName}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {users.length === 0 ? <DropdownMenuItem disabled>No agents available</DropdownMenuItem> : null}
        {users.map((u) => (
          <DropdownMenuItem key={u.id} onSelect={() => updateCase.mutate({ assignedToId: u.id })}>
            {u.fullName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TicketStatusDropdown({ kase }: { kase: Case }) {
  const { nextStatuses, selectTarget, targetLabel, isPending, resolveDialogOpen, setResolveDialogOpen, reason, setReason, confirmResolve } =
    useCaseLifecycle(kase);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex items-center gap-0.5" disabled={isPending || nextStatuses.length === 0}>
            <Badge variant={caseStatusVariant(kase.status)} className="cursor-pointer gap-1">
              {caseStatusLabel(kase.status)}
              {nextStatuses.length > 0 ? <ChevronDown className="h-3 w-3" aria-hidden /> : null}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        {nextStatuses.length > 0 ? (
          <DropdownMenuContent align="end">
            {nextStatuses.map((target) => (
              <DropdownMenuItem key={target} onSelect={() => selectTarget(target)}>
                {targetLabel(target)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve ticket</DialogTitle>
            <DialogDescription>Optionally record how this ticket was resolved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor={`resolutionNotes-${kase.id}`}>Resolution notes (optional)</Label>
            <Input id={`resolutionNotes-${kase.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sent replacement document via email" />
          </div>
          <DialogFooter>
            <button
              type="button"
              disabled={isPending}
              onClick={confirmResolve}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TicketCard({
  kase,
  clocks,
  contactName,
  accountName,
  users,
  selected,
  onSelectChange,
}: {
  kase: Case;
  clocks: SlaClock[] | undefined;
  contactName: string | null;
  accountName: string | null;
  users: UserOption[];
  selected: boolean;
  onSelectChange: (selected: boolean) => void;
}) {
  const slaInfo = summarizeSlaClocks(clocks);
  const isOverdue = slaInfo?.variant === 'destructive';
  const resolutionClock = clocks?.find((c) => c.status === 'RUNNING' || c.status === 'BREACHED');
  const overdueByMs = resolutionClock && new Date(resolutionClock.dueAt).getTime() < Date.now() ? Date.now() - new Date(resolutionClock.dueAt).getTime() : null;

  const displayName = contactName ?? 'Unknown requester';

  return (
    <Card className="shadow-brand-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <Checkbox checked={selected} onCheckedChange={(v) => onSelectChange(Boolean(v))} className="mt-1" aria-label="Select ticket" />
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="text-xs">{initials(displayName)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-1">
          {isOverdue ? (
            <Badge variant="destructive" className="mb-0.5">
              Overdue
            </Badge>
          ) : null}
          <Link href={`/cases/${kase.id}`} className="block truncate text-sm font-semibold text-foreground hover:underline">
            {kase.subject} <span className="font-normal text-muted-foreground">#{kase.caseNumber.split('-').pop()}</span>
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {displayName}
            {accountName ? ` (${accountName})` : ''} · Created {relativeTimeFrom(kase.createdAt)}
            {overdueByMs !== null ? ` · Resolution overdue by ${formatDuration(overdueByMs)}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <TicketPriorityDropdown kase={kase} />
          <TicketAssigneeDropdown kase={kase} users={users} />
          <TicketStatusDropdown kase={kase} />
        </div>
      </CardContent>
    </Card>
  );
}
