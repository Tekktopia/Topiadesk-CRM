'use client';

import * as React from 'react';
import { CASE_STATUS_TRANSITIONS, type Case, type CaseStatus } from '../../_lib/types';
import { caseStatusLabel } from '../../_lib/constants';
import { useChangeCaseStatus, useRequestCaseClosure } from '../../_lib/hooks';

/** Distinct labels for the PENDING_CUSTOMER/PENDING_CARRIER holds — see case-lifecycle.ts's doc comment: "different escalation paths, SlaClock pauses/resumes independently for each" — a real differentiator worth surfacing explicitly rather than a generic "Pending". */
const TARGET_LABEL: Partial<Record<CaseStatus, string>> = {
  PENDING_CUSTOMER: 'Mark pending — waiting on customer',
  PENDING_CARRIER: 'Mark pending — waiting on carrier',
};

/**
 * Shared status-transition logic — one definition of "what can this ticket
 * move to, and what happens when you pick one", restricted to
 * CASE_STATUS_TRANSITIONS[current status] (case-lifecycle.ts, hand-mirrored
 * into _lib/types.ts). Consumed by both CaseLifecycleActions (the case
 * detail page's full "Change status" button) and TicketCard's compact
 * inline status dropdown (ticket workspace) — same transition rules, same
 * RESOLVED-notes dialog, same COMPLAINT-closure-approval branch, different
 * trigger visuals per surface.
 */
export function useCaseLifecycle(kase: Case) {
  const nextStatuses = CASE_STATUS_TRANSITIONS[kase.status];
  const changeStatus = useChangeCaseStatus(kase.id);
  const requestClosure = useRequestCaseClosure(kase.id);
  const [resolveDialogOpen, setResolveDialogOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  function selectTarget(target: CaseStatus) {
    if (target === 'RESOLVED') {
      setReason('');
      setResolveDialogOpen(true);
      return;
    }
    if (target === 'CLOSED' && kase.caseType === 'COMPLAINT') {
      // Backend rejects a direct CLOSED transition for COMPLAINT cases —
      // this goes through the approval gate instead.
      requestClosure.mutate({});
      return;
    }
    changeStatus.mutate({ status: target });
  }

  function confirmResolve() {
    changeStatus.mutate({ status: 'RESOLVED', reason: reason || undefined }, { onSuccess: () => setResolveDialogOpen(false) });
  }

  function targetLabel(target: CaseStatus): string {
    if (target === 'CLOSED' && kase.caseType === 'COMPLAINT') return 'Request closure approval';
    return TARGET_LABEL[target] ?? `Mark as ${caseStatusLabel(target)}`;
  }

  return {
    nextStatuses,
    selectTarget,
    targetLabel,
    isPending: changeStatus.isPending || requestClosure.isPending,
    resolveDialogOpen,
    setResolveDialogOpen,
    reason,
    setReason,
    confirmResolve,
  };
}
