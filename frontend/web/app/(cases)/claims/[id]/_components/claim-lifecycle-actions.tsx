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
  toast,
} from '@topiadesk/ui';
import { CLAIM_STATUS_TRANSITIONS, type Claim, type ClaimStatus } from '../../../_lib/types';
import { claimStatusLabel } from '../../../_lib/constants';
import { useChangeClaimStatus, useReopenClaim } from '../../../_lib/hooks';

/**
 * Claim detail header's status-transition control — mirrors
 * app/(policy)/policies/[id]/lifecycle-actions.tsx's shape: a "Change
 * status" dropdown listing only the moves CLAIM_STATUS_TRANSITIONS allows
 * from the claim's current status (see claim-lifecycle.ts, hand-mirrored
 * into _lib/types.ts). Most transitions fire straight from the dropdown
 * item, same as the policy version; SETTLED/REPUDIATED/REOPENED each need
 * one extra field the backend records alongside the status change
 * (settledAmount, repudiationReason, reopen reason) so those three route
 * through a small dialog instead.
 */
export function ClaimLifecycleActions({ claim }: { claim: Claim }) {
  const status = claim.status;
  const nextStatuses = CLAIM_STATUS_TRANSITIONS[status];
  const changeStatus = useChangeClaimStatus(claim.id);
  const reopenClaim = useReopenClaim(claim.id);
  const [dialogTarget, setDialogTarget] = React.useState<'SETTLED' | 'REPUDIATED' | 'REOPENED' | null>(null);

  if (nextStatuses.length === 0) {
    return <span className="text-sm text-muted-foreground">No further transitions — this claim is in a terminal state.</span>;
  }

  function selectTarget(target: ClaimStatus) {
    if (target === 'SETTLED' || target === 'REPUDIATED' || target === 'REOPENED') {
      setDialogTarget(target);
      return;
    }
    changeStatus.mutate({ status: target });
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={changeStatus.isPending || reopenClaim.isPending}>
            Change status <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {nextStatuses.map((target) => (
            <DropdownMenuItem key={target} onSelect={() => selectTarget(target)}>
              Mark as {claimStatusLabel(target)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ExtraFieldDialog
        target={dialogTarget}
        onOpenChange={(open) => !open && setDialogTarget(null)}
        onSettle={(settledAmount, reason) => changeStatus.mutate({ status: 'SETTLED', settledAmount, reason }, { onSuccess: () => setDialogTarget(null) })}
        onRepudiate={(reason) => changeStatus.mutate({ status: 'REPUDIATED', reason }, { onSuccess: () => setDialogTarget(null) })}
        onReopen={(reason) => reopenClaim.mutate({ reason }, { onSuccess: () => setDialogTarget(null) })}
        isPending={changeStatus.isPending || reopenClaim.isPending}
      />
    </div>
  );
}

function ExtraFieldDialog({
  target,
  onOpenChange,
  onSettle,
  onRepudiate,
  onReopen,
  isPending,
}: {
  target: 'SETTLED' | 'REPUDIATED' | 'REOPENED' | null;
  onOpenChange: (open: boolean) => void;
  onSettle: (settledAmount: string, reason: string) => void;
  onRepudiate: (reason: string) => void;
  onReopen: (reason: string) => void;
  isPending: boolean;
}) {
  const [settledAmount, setSettledAmount] = React.useState('');
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (target) {
      setSettledAmount('');
      setReason('');
    }
  }, [target]);

  function submit() {
    if (target === 'SETTLED') {
      if (!settledAmount) {
        toast.error('Settled amount is required');
        return;
      }
      onSettle(settledAmount, reason);
    } else if (target === 'REPUDIATED') {
      onRepudiate(reason);
    } else if (target === 'REOPENED') {
      if (!reason) {
        toast.error('A reason is required to reopen a claim');
        return;
      }
      onReopen(reason);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target === 'SETTLED' ? 'Settle claim' : target === 'REPUDIATED' ? 'Repudiate claim' : 'Reopen claim'}
          </DialogTitle>
          <DialogDescription>
            {target === 'SETTLED'
              ? 'Records the settlement amount and closes the reserve.'
              : target === 'REPUDIATED'
                ? 'Records why this claim was declined.'
                : 'Records why this claim is being reopened for review.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {target === 'SETTLED' ? (
            <div className="space-y-1.5">
              <Label htmlFor="settledAmount">Settled amount</Label>
              <Input
                id="settledAmount"
                inputMode="decimal"
                placeholder="e.g. 480000.00"
                value={settledAmount}
                onChange={(e) => setSettledAmount(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason{target === 'REOPENED' ? ' (required)' : ' (optional)'}</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Additional documentation received" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={isPending}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
