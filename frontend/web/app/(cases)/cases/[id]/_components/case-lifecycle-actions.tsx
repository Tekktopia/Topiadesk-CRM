'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Button,
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
import { CASE_STATUS_TRANSITIONS, type Case, type CaseStatus } from '../../../_lib/types';
import { caseStatusLabel } from '../../../_lib/constants';
import { useChangeCaseStatus } from '../../../_lib/hooks';

/** Distinct labels for the PENDING_CUSTOMER/PENDING_CARRIER holds — see case-lifecycle.ts's doc comment: "different escalation paths, SlaClock pauses/resumes independently for each" — a real differentiator worth surfacing explicitly rather than a generic "Pending". */
const TARGET_LABEL: Partial<Record<CaseStatus, string>> = {
  PENDING_CUSTOMER: 'Mark pending — waiting on customer',
  PENDING_CARRIER: 'Mark pending — waiting on carrier',
};

/**
 * Case detail header's status-transition control — same shape as
 * ClaimLifecycleActions/lifecycle-actions.tsx: a dropdown restricted to
 * CASE_STATUS_TRANSITIONS[current status] (case-lifecycle.ts, hand-mirrored
 * into _lib/types.ts). Only RESOLVED accepts an optional extra field
 * (resolutionNotes) via a small dialog; every other move fires straight
 * from the dropdown item.
 */
export function CaseLifecycleActions({ kase }: { kase: Case }) {
  const nextStatuses = CASE_STATUS_TRANSITIONS[kase.status];
  const changeStatus = useChangeCaseStatus(kase.id);
  const [resolveDialogOpen, setResolveDialogOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  if (nextStatuses.length === 0) {
    return <span className="text-sm text-muted-foreground">No further transitions — this case is in a terminal state.</span>;
  }

  function selectTarget(target: CaseStatus) {
    if (target === 'RESOLVED') {
      setReason('');
      setResolveDialogOpen(true);
      return;
    }
    changeStatus.mutate({ status: target });
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={changeStatus.isPending}>
            Change status <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {nextStatuses.map((target) => (
            <DropdownMenuItem key={target} onSelect={() => selectTarget(target)}>
              {TARGET_LABEL[target] ?? `Mark as ${caseStatusLabel(target)}`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve case</DialogTitle>
            <DialogDescription>Optionally record how this case was resolved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="resolutionNotes">Resolution notes (optional)</Label>
            <Input id="resolutionNotes" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sent replacement document via email" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate({ status: 'RESOLVED', reason: reason || undefined }, { onSuccess: () => setResolveDialogOpen(false) })}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
