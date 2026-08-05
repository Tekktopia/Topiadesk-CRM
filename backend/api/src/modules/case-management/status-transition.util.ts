import { NotFoundException } from '@nestjs/common';
import { getPrismaClient, type Case, type CaseStatus, type Claim, type ClaimStatus } from '@topiadesk/db';
import { assertValidClaimTransition } from './claim-lifecycle';
import { assertValidCaseTransition, PENDING_CASE_STATUSES } from './case-lifecycle';
import { advanceClaimStageClocks, pauseCaseResolutionClock, resumeCaseResolutionClock, satisfyCaseResolutionClock } from './sla-clock.util';
import { enqueueSurveyInvitesForResolvedCase } from './survey-dispatch-queue';

/**
 * Single source of truth for "move a Claim to a new status", shared by
 * claims.controller.ts's POST :id/status and the automation SET_STATUS
 * action handler (automation/handlers.ts) — Macro-apply and a direct API
 * call must behave identically: validated transition, a ClaimStatusHistory
 * row every time (per the build brief), and the same STAGE_TRANSITION
 * SlaClock bookkeeping either way.
 */
export interface ClaimStatusTransitionExtras {
  /** Decimal-as-string, set alongside a transition into SETTLED. */
  settledAmount?: string;
  /** Set alongside a transition into REPUDIATED — kept as one atomic update rather than a separate PATCH, so a claim never has a REPUDIATED status with no reason recorded even transiently. */
  repudiationReason?: string;
}

export async function applyClaimStatusTransition(
  claimId: string,
  toStatus: ClaimStatus,
  changedById: string | null,
  reason?: string,
  extras: ClaimStatusTransitionExtras = {},
): Promise<Claim> {
  const prisma = getPrismaClient();
  const existing = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!existing) throw new NotFoundException('Claim not found');

  assertValidClaimTransition(existing.status, toStatus);
  if (existing.status === toStatus) return existing;

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: toStatus,
      settledAt: toStatus === 'SETTLED' ? new Date() : undefined,
      settledAmount: toStatus === 'SETTLED' ? extras.settledAmount : undefined,
      repudiationReason: toStatus === 'REPUDIATED' ? (extras.repudiationReason ?? reason) : undefined,
      reopenCount: toStatus === 'REOPENED' ? existing.reopenCount + 1 : undefined,
    },
  });

  await prisma.claimStatusHistory.create({
    data: { claimId, fromStatus: existing.status, toStatus, changedById: changedById ?? undefined, reason },
  });

  await advanceClaimStageClocks(claimId, existing.status, toStatus);

  return updated;
}

/**
 * Same role as applyClaimStatusTransition, for Case — plus the
 * PENDING_CUSTOMER/PENDING_CARRIER <-> OPEN RESOLUTION SlaClock
 * pause/resume and the RESOLVED-entry satisfy, both specified in the build
 * brief's "SLA clock lifecycle wiring" section.
 */
export async function applyCaseStatusTransition(caseId: string, toStatus: CaseStatus, reason?: string): Promise<Case> {
  const prisma = getPrismaClient();
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) throw new NotFoundException('Case not found');

  assertValidCaseTransition(existing.status, toStatus);
  if (existing.status === toStatus) return existing;

  const now = new Date();
  const updated = await prisma.case.update({
    where: { id: caseId },
    data: {
      status: toStatus,
      resolutionNotes: toStatus === 'RESOLVED' && reason ? reason : undefined,
      resolvedAt: toStatus === 'RESOLVED' ? now : undefined,
      closedAt: toStatus === 'CLOSED' ? now : undefined,
      reopenCount: toStatus === 'REOPENED' ? existing.reopenCount + 1 : undefined,
    },
  });

  const wasPending = PENDING_CASE_STATUSES.has(existing.status);
  const isPending = PENDING_CASE_STATUSES.has(toStatus);
  if (!wasPending && isPending) {
    await pauseCaseResolutionClock(caseId, now);
  } else if (wasPending && toStatus === 'OPEN') {
    await resumeCaseResolutionClock(caseId, now);
  }
  if (toStatus === 'RESOLVED') {
    await satisfyCaseResolutionClock(caseId, now);
    await enqueueSurveyInvitesForResolvedCase(caseId);
  }

  return updated;
}
