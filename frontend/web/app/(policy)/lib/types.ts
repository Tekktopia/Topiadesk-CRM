/**
 * Type aliases derived from `ApiPaths` (the generated OpenAPI types —
 * see packages/shared-types/src/api-client/schema.d.ts and the README
 * comment on packages/shared-types/src/index.ts) rather than hand-written
 * response interfaces, per the project convention: index into a path's
 * `responses`/`requestBody` rather than re-declaring the shape. These are
 * shared by every Route Handler and Client Component under
 * `app/(policy)/` and the dashboard's policy/premium/document data.
 */
import type { ApiPaths } from '@topiadesk/shared-types';

/**
 * openapi-typescript codegen gap: several backend DTOs mark a nullable
 * field with only `@ApiPropertyOptional()` and no explicit `{ nullable:
 * true, type: ... }` metadata (see e.g. policy-response.dto.ts's
 * `sumInsured?: string | null`). Swagger then emits an empty (`{}`) schema
 * for that property, which openapi-typescript renders as `Record<string,
 * never>` instead of `string | null` — a codegen artifact, not the actual
 * runtime shape. Rather than hand-writing these DTOs from scratch (which
 * the project convention in packages/shared-types/src/index.ts's comment
 * says to avoid), each affected alias below is still derived from
 * `ApiPaths` and only the handful of broken fields are patched back to
 * their real type, confirmed against the backend DTO source directly.
 */
type FixNullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: string | null };
/** Same codegen gap as FixNullable above, for a nullable field whose real type is `number` (e.g. PolicyAsset.year) rather than `string`. */
type FixNullableNumber<T, K extends keyof T> = Omit<T, K> & { [P in K]: number | null };

type PolicyDtoRaw = ApiPaths['/policies']['get']['responses'][200]['content']['application/json'][number];
export type PolicyDto = FixNullable<PolicyDtoRaw, 'sumInsured' | 'brokerOfRecordId' | 'currentVersionId'>;
export type CreatePolicyDto = ApiPaths['/policies']['post']['requestBody']['content']['application/json'];
export type UpdatePolicyDto = ApiPaths['/policies/{id}']['patch']['requestBody']['content']['application/json'];

type PolicyVersionDtoRaw =
  ApiPaths['/policies/{policyId}/versions']['get']['responses'][200]['content']['application/json'][number];
// `approvedCount`/`requiredApprovals` (Batch 5's multi-level approval
// chains) aren't in the generated schema yet — same manual-patch
// convention as this file's header comment. Present only when this
// version's approval is a multi-level ApprovalChain (requiredApprovals > 1
// resolved at creation), see policy-lifecycle.ts's resolveApprovalThreshold.
export type PolicyVersionDto = FixNullable<
  PolicyVersionDtoRaw,
  'changeDescription' | 'premiumImpact' | 'sumInsuredAtVersion' | 'approvalStatus'
> & {
  approvedCount?: number;
  requiredApprovals?: number;
};
export type CreatePolicyVersionDto =
  ApiPaths['/policies/{policyId}/versions']['post']['requestBody']['content']['application/json'];
export type DecideApprovalDto =
  ApiPaths['/policies/{policyId}/versions/{versionId}/decision']['post']['requestBody']['content']['application/json'];

type PremiumDtoRaw =
  ApiPaths['/policies/{policyId}/premiums']['get']['responses'][200]['content']['application/json'][number];
export type PremiumDto = FixNullable<
  PremiumDtoRaw,
  'policyVersionId' | 'commissionRate' | 'commissionAmount' | 'installmentPlan' | 'paidDate'
>;
export type CreatePremiumDto =
  ApiPaths['/policies/{policyId}/premiums']['post']['requestBody']['content']['application/json'];
export type PremiumAgingRowDto = ApiPaths['/premiums/aging']['get']['responses'][200]['content']['application/json'][number];
export type UpdatePremiumDto = ApiPaths['/premiums/{id}']['patch']['requestBody']['content']['application/json'];

type PolicyCoverageDtoRaw =
  ApiPaths['/policies/{policyId}/coverages']['get']['responses'][200]['content']['application/json'][number];
export type PolicyCoverageDto = FixNullable<
  PolicyCoverageDtoRaw,
  'sumInsured' | 'premium' | 'deductible' | 'limits' | 'subLimits' | 'conditions'
>;
export type CreatePolicyCoverageDto =
  ApiPaths['/policies/{policyId}/coverages']['post']['requestBody']['content']['application/json'];
export type UpdatePolicyCoverageDto =
  ApiPaths['/policies/{policyId}/coverages/{id}']['patch']['requestBody']['content']['application/json'];

type PolicyParticipantDtoRaw =
  ApiPaths['/policies/{policyId}/participants']['get']['responses'][200]['content']['application/json'][number];
export type PolicyParticipantDto = FixNullable<PolicyParticipantDtoRaw, 'contactId' | 'relationship' | 'percentage'>;
export type CreatePolicyParticipantDto =
  ApiPaths['/policies/{policyId}/participants']['post']['requestBody']['content']['application/json'];
export type UpdatePolicyParticipantDto =
  ApiPaths['/policies/{policyId}/participants/{id}']['patch']['requestBody']['content']['application/json'];

type PolicyAssetDtoRaw =
  ApiPaths['/policies/{policyId}/assets']['get']['responses'][200]['content']['application/json'][number];
type PolicyAssetDtoStringFixed = FixNullable<
  PolicyAssetDtoRaw,
  'registrationNo' | 'chassisNo' | 'address' | 'valuation' | 'makeModel' | 'latitude' | 'longitude'
>;
export type PolicyAssetDto = FixNullableNumber<PolicyAssetDtoStringFixed, 'year'>;
export type CreatePolicyAssetDto =
  ApiPaths['/policies/{policyId}/assets']['post']['requestBody']['content']['application/json'];
export type UpdatePolicyAssetDto =
  ApiPaths['/policies/{policyId}/assets/{id}']['patch']['requestBody']['content']['application/json'];

export const PARTICIPANT_TYPES = ['INSURED', 'BENEFICIARY', 'NOMINEE', 'DRIVER', 'ADDITIONAL_INSURED'] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const ASSET_TYPES = ['VEHICLE', 'PROPERTY', 'CARGO', 'VESSEL'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

type RenewalScheduleDtoRaw =
  ApiPaths['/policies/{policyId}/renewal-schedule']['get']['responses'][200]['content']['application/json'];
export type RenewalScheduleDto = FixNullable<RenewalScheduleDtoRaw, 'assignedToId' | 'lastAlertSentAt' | 'renewalMeetingDate'>;
export type UpdateRenewalScheduleDto =
  ApiPaths['/policies/{policyId}/renewal-schedule']['patch']['requestBody']['content']['application/json'];

type DocumentDtoRaw = ApiPaths['/documents']['get']['responses'][200]['content']['application/json'][number];
export type DocumentDto = FixNullable<DocumentDtoRaw, 'categoryId' | 'currentVersionId'>;
export type DocumentCategoryDto =
  ApiPaths['/documents/categories']['get']['responses'][200]['content']['application/json'][number];
export type DocumentLinkDto = ApiPaths['/documents/{id}/links']['get']['responses'][200]['content']['application/json'][number];

type ProducerDtoRaw = ApiPaths['/producers']['get']['responses'][200]['content']['application/json'][number];
export type ProducerDto = FixNullable<ProducerDtoRaw, 'licenseNumber' | 'licenseExpiry' | 'phone' | 'email' | 'parentProducerId' | 'linkedUserId'>;
export type CreateProducerDto = ApiPaths['/producers']['post']['requestBody']['content']['application/json'];
export type UpdateProducerDto = ApiPaths['/producers/{id}']['patch']['requestBody']['content']['application/json'];

export type ProducerPolicyAssignmentDto =
  ApiPaths['/policies/{policyId}/producers']['get']['responses'][200]['content']['application/json'][number];
export type CreateProducerPolicyAssignmentDto =
  ApiPaths['/policies/{policyId}/producers']['post']['requestBody']['content']['application/json'];

type ProducerCommissionDtoRaw = ApiPaths['/producer-commissions']['get']['responses'][200]['content']['application/json'][number];
export type ProducerCommissionDto = FixNullable<ProducerCommissionDtoRaw, 'premiumId' | 'paymentDate'>;
export type CreateProducerCommissionDto = ApiPaths['/producer-commissions']['post']['requestBody']['content']['application/json'];
export type UpdateProducerCommissionDto = ApiPaths['/producer-commissions/{id}']['patch']['requestBody']['content']['application/json'];

export const PRODUCER_TYPES = ['INTERNAL_BROKER', 'EXTERNAL_SUB_BROKER', 'CORRESPONDENT'] as const;
export type ProducerType = (typeof PRODUCER_TYPES)[number];

export const PRODUCER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type ProducerStatus = (typeof PRODUCER_STATUSES)[number];

export const PRODUCER_ASSIGNMENT_ROLES = ['PRIMARY', 'SUB_PRODUCER', 'SERVICING'] as const;
export type ProducerAssignmentRole = (typeof PRODUCER_ASSIGNMENT_ROLES)[number];

export const PRODUCER_COMMISSION_STATUSES = ['PENDING', 'APPROVED', 'PAID'] as const;
export type ProducerCommissionStatus = (typeof PRODUCER_COMMISSION_STATUSES)[number];

export type OperationalKpiDto = ApiPaths['/dashboards/operational-kpis']['get']['responses'][200]['content']['application/json'];

export type OpportunityDto = ApiPaths['/crm/opportunities']['get']['responses'][200]['content']['application/json'][number];
export type PipelineDetailDto = ApiPaths['/crm/pipelines/{id}']['get']['responses'][200]['content']['application/json'];
export type PipelineDto = ApiPaths['/crm/pipelines']['get']['responses'][200]['content']['application/json'][number];

/** Minimal id/name projections used for filter dropdowns and label lookups —
 * see app/api/policy-lookups/route.ts. Not full ApiPaths types because we
 * only ever need `id` + `name` off Account/Carrier for this purpose. */
export interface LookupOption {
  id: string;
  name: string;
}

/** id -> name/email directory entry — see app/api/identity-users/route.ts. */
export interface UserOption {
  id: string;
  fullName: string;
  email: string;
}

/** Not in the generated schema — a brand-new endpoint (Batch 5's approval
 * chains), hand-written like LookupOption/UserOption above rather than
 * derived from ApiPaths. `PolicyVersionType` is declared further down this
 * file (derived from POLICY_VERSION_TYPES). */
export interface ApprovalThresholdRule {
  id: string;
  versionType: PolicyVersionType;
  minAmount: string | null;
  requiredApprovals: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalThresholdRuleInput {
  versionType: PolicyVersionType;
  minAmount?: string;
  requiredApprovals: number;
}

export type UpdateApprovalThresholdRuleInput = Partial<CreateApprovalThresholdRuleInput>;

export const POLICY_STATUSES = ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const POLICY_VERSION_TYPES = ['ISSUANCE', 'ENDORSEMENT', 'RENEWAL', 'CANCELLATION', 'REINSTATEMENT'] as const;
export type PolicyVersionType = (typeof POLICY_VERSION_TYPES)[number];

/** Mirrors backend/api/src/modules/policy/policy-lifecycle.ts's
 * POLICY_STATUS_TRANSITIONS — kept in sync manually (same hand-mirrored
 * convention as packages/shared-types/src/enums.ts). Used purely for UI
 * affordances (disabling actions that would 400); the backend remains the
 * source of truth and re-validates on every write. */
export const POLICY_STATUS_TRANSITIONS: Record<PolicyStatus, PolicyStatus[]> = {
  QUOTED: ['BOUND', 'CANCELLED'],
  BOUND: ['ISSUED', 'CANCELLED'],
  ISSUED: ['ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
  ENDORSED: ['ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
  RENEWED: ['ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
  LAPSED: ['RENEWED', 'ISSUED'],
  CANCELLED: [],
};

/** Mirrors VERSION_TYPE_STATUS_EFFECT + APPROVAL_GATED_VERSION_TYPES from
 * policy-lifecycle.ts. */
export const VERSION_TYPE_STATUS_EFFECT: Record<PolicyVersionType, PolicyStatus> = {
  ISSUANCE: 'ISSUED',
  ENDORSEMENT: 'ENDORSED',
  RENEWAL: 'RENEWED',
  CANCELLATION: 'CANCELLED',
  REINSTATEMENT: 'ISSUED',
};

export const APPROVAL_GATED_VERSION_TYPES: ReadonlySet<PolicyVersionType> = new Set(['ENDORSEMENT', 'CANCELLATION']);

/** Given a policy's current status, which PolicyVersion types would produce
 * a *valid* next status per the state machine above — drives which options
 * the "New version" dialog offers instead of letting the user pick an
 * action the backend will 400 on. */
export function availableVersionTypes(currentStatus: PolicyStatus): PolicyVersionType[] {
  const allowedNextStatuses = new Set(POLICY_STATUS_TRANSITIONS[currentStatus]);
  return POLICY_VERSION_TYPES.filter((type) => allowedNextStatuses.has(VERSION_TYPE_STATUS_EFFECT[type]));
}

const VERSIONED_TARGET_STATUSES = new Set(Object.values(VERSION_TYPE_STATUS_EFFECT));

/**
 * The subset of a policy's valid next statuses that have NO corresponding
 * PolicyVersion type at all (BOUND, LAPSED — see VERSION_TYPE_STATUS_EFFECT
 * above, whose values are only ISSUED/ENDORSED/RENEWED/CANCELLED) — i.e.
 * the only moves the UI should ever offer as a plain direct status change
 * (PATCH /policies/:id). Every other transition is deliberately routed
 * through the "new policy version" flow instead, even where the backend
 * would also technically accept a direct PATCH (e.g. QUOTED->CANCELLED) —
 * that keeps the versioned/audited path (and, for ENDORSEMENT/CANCELLATION,
 * the maker-checker approval gate) the only route the UI exposes for
 * anything a version type can represent, instead of offering a shortcut
 * that would silently skip it.
 */
export function directOnlyTransitions(currentStatus: PolicyStatus): PolicyStatus[] {
  return POLICY_STATUS_TRANSITIONS[currentStatus].filter((s) => !VERSIONED_TARGET_STATUSES.has(s));
}

// -- Renewals board ----------------------------------------------------------
// Hand-written rather than ApiPaths-derived, matching this file's existing
// convention for endpoints the OpenAPI client hasn't been regenerated for.

export type RenewalStatus = 'ON_TRACK' | 'AT_RISK' | 'IN_PROGRESS' | 'RENEWED' | 'LAPSED' | 'DECLINED_TO_RENEW';

export interface RenewalBoardRow {
  policyId: string;
  policyNumber: string;
  accountId: string;
  accountName: string;
  carrierName: string;
  lineOfBusiness: string;
  expiryDate: string;
  /** Negative once the policy has already expired. */
  daysToExpiry: number;
  renewalStatus: RenewalStatus | null;
  renewalDueDate: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  brokerOfRecordName: string | null;
  annualPremiumBase: number;
  baseCurrency: string;
  /** No RenewalSchedule row exists — expiring with no process started at all. */
  scheduleMissing: boolean;
}

export interface RenewalBoardStats {
  total: number;
  overdue: number;
  dueIn30: number;
  dueIn60: number;
  dueIn90: number;
  unassigned: number;
  atRisk: number;
  noScheduleStarted: number;
  valueAtRisk: number;
  baseCurrency: string;
}

export type RenewalBoardQuery = {
  withinDays?: number;
  renewalStatus?: RenewalStatus;
  assignedToId?: string;
  brokerOfRecordId?: string;
  accountId?: string;
  carrierId?: string;
  lineOfBusiness?: string;
  q?: string;
  /** 'true' only — a string, matching how the API models boolean query flags. */
  unassignedOnly?: string;
  sortBy?: 'expiryDate' | 'premium';
  take?: number;
  skip?: number;
};
