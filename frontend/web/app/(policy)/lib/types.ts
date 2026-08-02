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

type PolicyDtoRaw = ApiPaths['/policies']['get']['responses'][200]['content']['application/json'][number];
export type PolicyDto = FixNullable<PolicyDtoRaw, 'sumInsured' | 'brokerOfRecordId' | 'currentVersionId'>;
export type CreatePolicyDto = ApiPaths['/policies']['post']['requestBody']['content']['application/json'];
export type UpdatePolicyDto = ApiPaths['/policies/{id}']['patch']['requestBody']['content']['application/json'];

type PolicyVersionDtoRaw =
  ApiPaths['/policies/{policyId}/versions']['get']['responses'][200]['content']['application/json'][number];
export type PolicyVersionDto = FixNullable<
  PolicyVersionDtoRaw,
  'changeDescription' | 'premiumImpact' | 'sumInsuredAtVersion' | 'approvalStatus'
>;
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
