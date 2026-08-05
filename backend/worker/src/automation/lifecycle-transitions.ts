/**
 * Duplicated (not imported — see action-handler.ts's header comment) from
 * backend/api/src/modules/case-management/claim-lifecycle.ts and
 * case-lifecycle.ts. Only what the SET_STATUS action handler needs: a
 * yes/no transition check, not the full BadRequestException-throwing HTTP
 * validation those files provide. Keep in sync with the two API files if
 * either transition map changes.
 */

const CLAIM_STATUS_TRANSITIONS: Record<string, string[]> = {
  NOTIFIED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['ADJUSTED', 'REPUDIATED', 'WITHDRAWN'],
  ADJUSTED: ['SETTLED', 'REPUDIATED', 'UNDER_REVIEW'],
  SETTLED: ['REOPENED'],
  REPUDIATED: ['REOPENED'],
  REOPENED: ['UNDER_REVIEW'],
  WITHDRAWN: [],
};

const CASE_STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['OPEN', 'CLOSED'],
  OPEN: ['PENDING_CUSTOMER', 'PENDING_CARRIER', 'RESOLVED', 'CLOSED'],
  PENDING_CUSTOMER: ['OPEN', 'RESOLVED', 'CLOSED'],
  PENDING_CARRIER: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN'],
};

export function isValidClaimTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return CLAIM_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidCaseTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return CASE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
