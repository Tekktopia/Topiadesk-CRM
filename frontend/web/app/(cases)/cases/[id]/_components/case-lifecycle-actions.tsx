'use client';

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
import type { Case } from '../../../_lib/types';
import { useCaseLifecycle } from '../../_components/use-case-lifecycle';

/**
 * Case detail header's status-transition control — see
 * use-case-lifecycle.ts for the shared transition rules (also consumed by
 * TicketCard's compact dropdown in the ticket workspace).
 */
export function CaseLifecycleActions({ kase }: { kase: Case }) {
  const { nextStatuses, selectTarget, targetLabel, isPending, resolveDialogOpen, setResolveDialogOpen, reason, setReason, confirmResolve } =
    useCaseLifecycle(kase);

  if (nextStatuses.length === 0) {
    return <span className="text-sm text-muted-foreground">No further transitions — this ticket is in a terminal state.</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={isPending}>
            Change status <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {nextStatuses.map((target) => (
            <DropdownMenuItem key={target} onSelect={() => selectTarget(target)}>
              {targetLabel(target)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve ticket</DialogTitle>
            <DialogDescription>Optionally record how this ticket was resolved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="resolutionNotes">Resolution notes (optional)</Label>
            <Input id="resolutionNotes" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sent replacement document via email" />
          </div>
          <DialogFooter>
            <Button type="button" disabled={isPending} onClick={confirmResolve}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
