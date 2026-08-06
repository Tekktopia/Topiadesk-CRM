'use client';

import { Check } from 'lucide-react';
import { Badge, Card, CardContent, cn } from '@topiadesk/ui';
import { SlaClockRow } from '../../../_components/sla-badge';
import { caseStatusPendingDescription } from '../../../_lib/constants';
import { formatDuration } from '../../../_lib/format';
import type { Case, CaseStatus, SlaClock } from '../../../_lib/types';

const SPINE_STEPS = [
  { key: 'NEW', label: 'New' },
  { key: 'OPEN', label: 'Open' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CLOSED', label: 'Closed' },
] as const;

/**
 * CASE_STATUS_TRANSITIONS (case-lifecycle.ts) branches and loops — NEW can
 * skip straight to CLOSED, OPEN fans out to two parallel PENDING_* holds,
 * RESOLVED/CLOSED both loop back via REOPENED. This maps that graph onto
 * the real "happy path" spine (New -> Open -> Resolved -> Closed) rather
 * than inventing a literal step for every status: PENDING_CUSTOMER/
 * PENDING_CARRIER/REOPENED all land on the Open node, distinguished by the
 * qualifier badge next to the tracker instead of a step of their own —
 * they're holds/loops on Open, not forward progress past it.
 */
function currentStepIndex(status: CaseStatus): number {
  switch (status) {
    case 'NEW':
      return 0;
    case 'RESOLVED':
      return 2;
    case 'CLOSED':
      return 3;
    case 'OPEN':
    case 'PENDING_CUSTOMER':
    case 'PENDING_CARRIER':
    case 'REOPENED':
    default:
      return 1;
  }
}

/** Process stepper + SLA tracker, pinned at the top of the ticket detail page (see case-detail-view.tsx) — promotes SLA status from a conditional card 4 items down the page into an always-visible widget, and gives the ticket's lifecycle a glanceable at-a-glance shape the way a Dynamics 365 Business Process Flow does. */
export function CaseProcessTracker({
  kase,
  firstResponse,
  resolution,
  hasSlaAccess,
}: {
  kase: Case;
  firstResponse: SlaClock | null;
  resolution: SlaClock | null;
  hasSlaAccess: boolean;
}) {
  const currentIndex = currentStepIndex(kase.status);
  const activeForMs = Date.now() - new Date(kase.updatedAt).getTime();
  const pendingDescription = caseStatusPendingDescription(kase.status);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="shrink-0">Ticket Process</Badge>
          <span className="text-xs text-muted-foreground">Active for {formatDuration(activeForMs)}</span>
          {pendingDescription ? <Badge variant="warning">{pendingDescription}</Badge> : null}
          {kase.status === 'REOPENED' ? <Badge variant="warning">Reopened</Badge> : null}
        </div>

        <ol className="flex items-center">
          {SPINE_STEPS.map((step, index) => {
            const isDone = index < currentIndex;
            const isCurrent = index === currentIndex;
            return (
              <li key={step.key} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center border-2 text-xs font-semibold',
                      isDone
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isCurrent
                          ? 'border-primary bg-background text-primary ring-2 ring-primary/30'
                          : 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                  </span>
                  <span className={cn('whitespace-nowrap text-xs font-medium', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                    {step.label}
                  </span>
                </div>
                {index < SPINE_STEPS.length - 1 ? <div className={cn('mx-2 h-0.5 flex-1', isDone ? 'bg-primary' : 'bg-border')} /> : null}
              </li>
            );
          })}
        </ol>

        {kase.slaPolicyId ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
            {hasSlaAccess ? (
              firstResponse || resolution ? (
                <>
                  <SlaClockRow label="First response" clock={firstResponse} />
                  <SlaClockRow label="Resolution" clock={resolution} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground sm:col-span-2">No active SLA clocks for this ticket.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground sm:col-span-2">SLA clock detail requires additional permissions.</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
