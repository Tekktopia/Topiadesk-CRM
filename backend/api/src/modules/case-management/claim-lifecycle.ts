import { BadRequestException } from '@nestjs/common';
import type { ClaimStatus } from '@topiadesk/db';

/**
 * NOTIFIED -> UNDER_REVIEW -> ADJUSTED -> SETTLED, per the build brief.
 * REPUDIATED and WITHDRAWN are near-terminal (only REOPENED escapes them —
 * REPUDIATED via a fresh review, WITHDRAWN not at all). Mirrors
 * policy-lifecycle.ts's POLICY_STATUS_TRANSITIONS: same-status "transitions"
 * (from === to) are allowed as no-ops by assertValidClaimTransition so
 * PATCHing unrelated Claim fields doesn't require re-sending an unchanged
 * status.
 */
export const CLAIM_STATUS_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  NOTIFIED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['ADJUSTED', 'REPUDIATED', 'WITHDRAWN'],
  ADJUSTED: ['SETTLED', 'REPUDIATED', 'UNDER_REVIEW'],
  SETTLED: ['REOPENED'],
  REPUDIATED: ['REOPENED'],
  REOPENED: ['UNDER_REVIEW'],
  WITHDRAWN: [],
};

export function assertValidClaimTransition(from: ClaimStatus, to: ClaimStatus): void {
  if (from === to) return;
  const allowed = CLAIM_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new BadRequestException(`Cannot transition claim status from ${from} to ${to}`);
  }
}
