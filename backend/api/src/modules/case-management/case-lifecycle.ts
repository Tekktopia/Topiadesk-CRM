import { BadRequestException } from '@nestjs/common';
import type { CaseStatus } from '@topiadesk/db';

/**
 * Not specified verbatim in the build brief (only Claim's transition map
 * was) — designed to mirror its shape and CasePriority/CaseStatus's own
 * intent: PENDING_CUSTOMER/PENDING_CARRIER are reversible holds reachable
 * only from OPEN and returning only to OPEN (see sla-clock.util.ts — that's
 * exactly the pause/resume boundary for the RESOLUTION SlaClock), RESOLVED
 * is reachable from any active state, CLOSED is reachable from RESOLVED or
 * directly (a case closed without formal resolution, e.g. a duplicate), and
 * REOPENED is a distinct re-entry state (matching Case.reopenCount) that
 * must be actively moved back to OPEN rather than silently resuming
 * wherever it left off. Same-status "transitions" (from === to) are no-ops,
 * mirroring policy-lifecycle.ts / claim-lifecycle.ts.
 */
export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ['OPEN', 'CLOSED'],
  OPEN: ['PENDING_CUSTOMER', 'PENDING_CARRIER', 'RESOLVED', 'CLOSED'],
  PENDING_CUSTOMER: ['OPEN', 'RESOLVED', 'CLOSED'],
  PENDING_CARRIER: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN'],
};

export function assertValidCaseTransition(from: CaseStatus, to: CaseStatus): void {
  if (from === to) return;
  const allowed = CASE_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new BadRequestException(`Cannot transition case status from ${from} to ${to}`);
  }
}

export const PENDING_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set(['PENDING_CUSTOMER', 'PENDING_CARRIER']);
