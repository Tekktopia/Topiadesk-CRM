// Hand-typed to match backend/api/src/modules/crm/dto/compliance.dto.ts —
// small enough, and specific enough to this one dashboard, that generating
// through the OpenAPI pipeline isn't worth the extra step (same reasoning
// this codebase already applies to other narrow, dashboard-only DTOs).
export interface ComplianceSummaryDto {
  openDsrCount: number;
  kycExpiringCount: number;
  kycAttentionCount: number;
  consentRecordsThisWeek: number;
  latestCheckpointAt: string | null;
}

export type KycUrgency = 'EXPIRED' | 'EXPIRING_SOON' | 'NOT_VERIFIED';

export interface KycAccountDto {
  id: string;
  name: string;
  kycStatus: string;
  kycExpiryDate: string | null;
  urgency: KycUrgency;
}
