import { BadRequestException } from '@nestjs/common';
import { getPrismaClient, type ApprovalEntityType, type KycStatus, type PolicyStatus, type PolicyVersionType } from '@topiadesk/db';

/** FSC's "KYC Expiry Flow" (docs/Topiadesk_CRM_FSC_Insurance_Spec.md §5): a RENEWAL quote can't be created against an account whose KYC isn't verified and comfortably current. */
export const KYC_RENEWAL_MIN_DAYS_REMAINING = 30;

/**
 * QUOTED -> BOUND -> ISSUED -> ENDORSED/CANCELLED/LAPSED/RENEWED, per the
 * BRD's policy lifecycle. CANCELLED is deliberately terminal (no entry in
 * this map's value for it) — a cancelled policy cannot be reactivated by
 * editing its status; reinstating coverage is a REINSTATEMENT PolicyVersion
 * from LAPSED only (see VERSION_TYPE_EFFECT below), never from CANCELLED.
 * Same-status "transitions" (from === to) are allowed as no-ops by
 * assertValidPolicyTransition so PATCHing unrelated fields doesn't require
 * re-sending an unchanged status.
 */
export const POLICY_STATUS_TRANSITIONS: Record<PolicyStatus, PolicyStatus[]> = {
  QUOTED: ['BOUND', 'CANCELLED'],
  BOUND: ['ISSUED', 'CANCELLED'],
  ISSUED: ['ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
  ENDORSED: ['ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
  RENEWED: ['ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
  LAPSED: ['RENEWED', 'ISSUED'], // ISSUED reachable only via an approved REINSTATEMENT version
  CANCELLED: [],
};

export function assertValidPolicyTransition(from: PolicyStatus, to: PolicyStatus): void {
  if (from === to) return;
  const allowed = POLICY_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new BadRequestException(`Cannot transition policy status from ${from} to ${to}`);
  }
}

/**
 * The Policy.status a PolicyVersion produces once its effect is applied
 * (immediately for ungated types, on Approval for gated ones — see
 * APPROVAL_GATED_VERSION_TYPES below).
 */
export const VERSION_TYPE_STATUS_EFFECT: Record<PolicyVersionType, PolicyStatus> = {
  ISSUANCE: 'ISSUED',
  ENDORSEMENT: 'ENDORSED',
  RENEWAL: 'RENEWED',
  CANCELLATION: 'CANCELLED',
  REINSTATEMENT: 'ISSUED',
};

/**
 * Maker-checker gate rule (BRD Phase-1 NFR: segregation of duties — see
 * the Approval model / approvals_requester_ne_approver constraint):
 * ENDORSEMENT and CANCELLATION versions create a PENDING Approval instead
 * of applying immediately; the version row is still created (so there's a
 * durable record of what was proposed, including if later rejected), but
 * Policy.status/currentVersionId/sumInsured are only mutated once a
 * COMPLIANCE_OFFICER-or-ALL-scope user approves it (policy-version.controller.ts).
 * ISSUANCE/RENEWAL/REINSTATEMENT apply immediately — routine lifecycle
 * events, not the kind of contract amendment or termination the BRD singles
 * out for review.
 */
export const APPROVAL_GATED_VERSION_TYPES: ReadonlySet<PolicyVersionType> = new Set(['ENDORSEMENT', 'CANCELLATION']);

export const VERSION_TYPE_APPROVAL_ENTITY_TYPE: Partial<Record<PolicyVersionType, ApprovalEntityType>> = {
  ENDORSEMENT: 'POLICY_ENDORSEMENT',
  CANCELLATION: 'POLICY_CANCELLATION',
};

export function isApprovalGated(versionType: PolicyVersionType): boolean {
  return APPROVAL_GATED_VERSION_TYPES.has(versionType);
}

/**
 * How many distinct approvals a gated PolicyVersion needs, per
 * ApprovalThresholdRule — same most-specific-wins resolution as
 * resolveSlaPolicy() (case-management/sla-clock.util.ts): the smallest
 * configured `minAmount` the actual amount still clears wins (a rule with
 * `minAmount` null is the catch-all default). Zero rules configured for
 * this versionType (the common case today) means `requiredApprovals` is
 * always 1 — byte-for-byte the pre-existing single-approver behavior.
 */
/**
 * FSC's KYC Expiry Flow: "If Contact KYC Expiry < 30 days -> Block renewal
 * quote -> Send notification". The field actually lives on Account (per the
 * spec's own field list under "A. Customer Model" — Contact only carries ID
 * Type/ID Number supporting detail), so this checks the policy's Account.
 * Blocks unless KYC is VERIFIED and still has more than
 * KYC_RENEWAL_MIN_DAYS_REMAINING days before expiry — no KYC on file at all
 * (kycExpiryDate null) is treated the same as expired, not as "not
 * applicable".
 */
export function assertKycValidForRenewal(account: { kycStatus: KycStatus; kycExpiryDate: Date | null }): void {
  const daysRemaining = account.kycExpiryDate
    ? Math.floor((account.kycExpiryDate.getTime() - Date.now()) / 86_400_000)
    : null;
  const valid = account.kycStatus === 'VERIFIED' && daysRemaining !== null && daysRemaining > KYC_RENEWAL_MIN_DAYS_REMAINING;
  if (!valid) {
    throw new BadRequestException(
      `Cannot create a renewal quote: this account's KYC is ${account.kycStatus.toLowerCase().replace('_', ' ')}` +
        (daysRemaining !== null ? ` (expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'})` : ' (no KYC expiry on file)') +
        `. KYC must be verified with more than ${KYC_RENEWAL_MIN_DAYS_REMAINING} days remaining before a renewal can be quoted.`,
    );
  }
}

export async function resolveApprovalThreshold(versionType: PolicyVersionType, amount: number | null): Promise<number> {
  const rules = await getPrismaClient().approvalThresholdRule.findMany({ where: { versionType } });
  if (rules.length === 0) return 1;

  let best: { minAmount: number | null; requiredApprovals: number } | null = null;
  for (const rule of rules) {
    const minAmount = rule.minAmount ? Number(rule.minAmount) : null;
    if (minAmount !== null && (amount === null || amount < minAmount)) continue;
    if (!best || (minAmount !== null && (best.minAmount === null || minAmount > best.minAmount))) {
      best = { minAmount, requiredApprovals: rule.requiredApprovals };
    }
  }
  return best?.requiredApprovals ?? 1;
}
