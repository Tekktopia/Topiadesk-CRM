import type { ApiPaths } from '@topiadesk/shared-types';

/**
 * CRM data shapes for app/(crm)/**.
 *
 * Request bodies and query params are derived straight from the live
 * OpenAPI schema (`ApiPaths`, see packages/shared-types/src/api-client/
 * schema.d.ts) — those are precise (enums come through as literal unions,
 * e.g. `riskRating?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"`).
 *
 * Response shapes are HAND-MIRRORED from the backend response DTOs
 * (backend/api/src/modules/crm/dto/*.ts) instead of derived from `ApiPaths`,
 * because nestjs/swagger can't infer a concrete type for a bare
 * `@ApiProperty({ nullable: true }) foo!: string | null` property (no
 * explicit `type` given) and falls back to `type: object` — so the
 * generated schema types every nullable string/number field (riskRating,
 * industryId, city, email, ...) as `Record<string, never> | null` instead
 * of `string | null`. Using that directly would make every nullable field
 * on every response DTO effectively unusable without a cast at every call
 * site. Hand-mirroring here follows the same documented convention as
 * packages/shared-types/src/enums.ts and lib/auth/types.ts ("keep in sync
 * manually") — update this file if a backend/api/src/modules/crm/dto/*.ts
 * response shape changes.
 */

type Paths = ApiPaths;

// -- Accounts -----------------------------------------------------------

export interface Account {
  id: string;
  name: string;
  accountType: 'INDIVIDUAL' | 'CORPORATE' | 'HOUSEHOLD';
  status: 'PROSPECT' | 'CLIENT' | 'FORMER_CLIENT';
  ownerId: string;
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  industryId: string | null;
  parentAccountId: string | null;
  city: string | null;
  country: string | null;
  kycStatus: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'REJECTED';
  kycExpiryDate: string | null;
  naicomId: string | null;
  /** Composite relationship-health signal — see refresh-health-score.job.ts. Distinct from riskRating (manual underwriting risk). */
  healthScore: number | null;
  healthScoreComputedAt: string | null;
  /** Phase 2 — jsonb, keyed by active CustomFieldDefinition.key for entityType=ACCOUNT. */
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  householdRole: string | null;
  idType: string | null;
  idNumber: string | null;
  isPrimary: boolean;
}

export interface AccountCounts {
  contacts: number;
  opportunities: number;
  tasks: number;
  policies: number;
  activities: number;
  relationships: number;
}

export interface AccountFinancials {
  totalSumInsured: string | null;
  totalGrossPremium: string | null;
  totalOutstandingPremium: string | null;
  wonOpportunityValue: string | null;
}

export interface AccountRef {
  id: string;
  name: string;
}

export interface AccountDetail extends Account {
  contacts: ContactSummary[];
  counts: AccountCounts;
  financials: AccountFinancials;
  parentAccount: AccountRef | null;
  subAccounts: AccountRef[];
}

/** GET /crm/accounts/:id/group-rollup — this account's own figures (AccountFinancials) PLUS every descendant in its parentAccountId/subAccounts tree, recursively. */
export interface AccountGroupRollup {
  accountCount: number;
  memberCount: number;
  totalPolicies: number;
  openClaims: number;
  totalSumInsured: string | null;
  totalGrossPremium: string | null;
  subsidiaries: AccountRef[];
}

export interface AccountSlaOverride {
  id: string;
  accountId: string;
  entityType: 'CASE' | 'CLAIM';
  slaPolicyId: string;
  slaPolicyName: string;
}

export type AccountRelationshipType = 'REFERRAL_SOURCE' | 'COMPETITOR' | 'JOINT_VENTURE' | 'PARENT_SUBSIDIARY' | 'OTHER';

export interface AccountRelationship {
  id: string;
  accountAId: string;
  accountAName: string;
  accountBId: string;
  accountBName: string;
  relationshipType: AccountRelationshipType;
  notes: string | null;
  createdAt: string;
}

export interface CreateAccountRelationshipInput {
  relatedAccountId: string;
  relationshipType: AccountRelationshipType;
  notes?: string;
}

export type UpdateAccountRelationshipInput = Partial<CreateAccountRelationshipInput>;

export interface AccountRenewalRow {
  policyId: string;
  policyNumber: string;
  policyStatus: string;
  expiryDate: string;
  renewalStatus: string | null;
  renewalDueDate: string | null;
  nextAlertDueAt: string | null;
  assignedToId: string | null;
}

export type AccountQuery = NonNullable<Paths['/crm/accounts']['get']['parameters']['query']>;
// `& { customFields?: ... }` because ApiPaths (packages/shared-types/src/api-client/schema.d.ts)
// hasn't been regenerated against the Phase 2 OpenAPI schema yet — customFields
// is a real, accepted field on CreateAccountDto/UpdateAccountDto
// (backend/api/src/modules/crm/dto/account.dto.ts) that the generated schema
// doesn't know about. Same "keep in sync manually" convention as this file's
// header comment already documents for response shapes.
export type CreateAccountInput = Paths['/crm/accounts']['post']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
};
export type UpdateAccountInput = Paths['/crm/accounts/{id}']['patch']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
};

// -- Contacts -------------------------------------------------------------

export interface Contact {
  id: string;
  accountId: string | null;
  carrierId: string | null;
  siteId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  householdRole: string | null;
  idType: string | null;
  idNumber: string | null;
  isPrimary: boolean;
  /** Set once a DataSubjectRequest DELETE has been processed for this contact. */
  anonymizedAt: string | null;
  /** Phase 2 — jsonb, keyed by active CustomFieldDefinition.key for entityType=CONTACT. */
  customFields: Record<string, unknown>;
  createdAt: string;
}

// -- Data Subject Requests (NDPR/GDPR) --------------------------------------
// Hand-written, not ApiPaths-derived — new endpoints the generator hasn't
// seen, same convention as this file's other Phase-2-and-later additions.
export type DataSubjectRequestType = 'EXPORT' | 'DELETE';
export type DataSubjectRequestStatus = 'PENDING' | 'COMPLETED' | 'REJECTED';
export interface DataSubjectRequest {
  id: string;
  contactId: string;
  requestType: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  notes: string | null;
  requestedById: string;
  exportData: unknown;
  processedById: string | null;
  processedAt: string | null;
  createdAt: string;
}
export interface CreateDataSubjectRequestInput {
  contactId: string;
  requestType: DataSubjectRequestType;
  notes?: string;
}

// -- Consent Records ---------------------------------------------------------
// General-purpose consent log — consentType/source are free text
// (see ConsentRecord's schema comment), so no enum here.
export interface ConsentRecord {
  id: string;
  contactId: string;
  consentType: string;
  granted: boolean;
  source: string;
  notes: string | null;
  recordedById: string | null;
  createdAt: string;
}
export interface CreateConsentRecordInput {
  contactId: string;
  consentType: string;
  granted: boolean;
  source: string;
  notes?: string;
}
export interface CurrentConsent {
  consentType: string;
  granted: boolean;
  source: string;
  recordedAt: string;
}

export type ContactQuery = NonNullable<Paths['/crm/contacts']['get']['parameters']['query']>;
// See CreateAccountInput's comment — ApiPaths hasn't been regenerated for Phase 2's customFields/siteId.
export type CreateContactInput = Paths['/crm/contacts']['post']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
  siteId?: string;
};
export type UpdateContactInput = Paths['/crm/contacts/{id}']['patch']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
  siteId?: string;
};

// -- Sites ------------------------------------------------------------------

export interface Site {
  id: string;
  accountId: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteInput {
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  isPrimary?: boolean;
}

export type UpdateSiteInput = Partial<CreateSiteInput>;

// -- Carriers ---------------------------------------------------------------

export type CarrierPanelStatus = 'PROSPECTIVE' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface Carrier {
  id: string;
  name: string;
  carrierType: 'INSURER' | 'REINSURER' | 'BOTH';
  amBestRating: string | null;
  linesOfBusiness: string[];
  panelStatus: CarrierPanelStatus | null;
  treatyType: string | null;
  commissionTerms: string | null;
  createdAt: string;
}

export type CreateCarrierInput = Paths['/crm/carriers']['post']['requestBody']['content']['application/json'];
export type UpdateCarrierInput = Paths['/crm/carriers/{id}']['patch']['requestBody']['content']['application/json'];

/** GET /crm/carriers/:id/policies */
export interface CarrierPolicyRow {
  id: string;
  policyNumber: string;
  accountId: string;
  accountName: string;
  lineOfBusiness: string;
  status: string;
  sumInsured: string | null;
  currency: string;
  expiryDate: string;
}

/** GET /crm/carriers/:id/market-submissions */
export interface CarrierMarketSubmissionRow {
  id: string;
  opportunityId: string;
  opportunityName: string;
  quotedPremium: string | null;
  status: 'SUBMITTED' | 'DECLINED' | 'QUOTED' | 'BOUND';
  submittedAt: string;
  respondedAt: string | null;
}

/** GET /crm/carriers/:id/scorecard */
export interface CarrierScorecard {
  totalSubmissions: number;
  totalBound: number;
  bindRatio: number | null;
  avgResponseDays: number | null;
  totalGrossPremium: string | null;
  totalSettledClaims: string | null;
  lossRatio: number | null;
}

// -- Leads ------------------------------------------------------------------

export interface Lead {
  id: string;
  source: 'WEB' | 'EMAIL' | 'REFERRAL' | 'PARTNER' | 'SOCIAL' | 'PHONE' | 'EVENT' | 'OTHER';
  sourceCampaign: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  score: number;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED';
  assignedToId: string | null;
  convertedAccountId: string | null;
  convertedOpportunityId: string | null;
  qualificationNotes: string | null;
  /** Phase 2 — jsonb, keyed by active CustomFieldDefinition.key for entityType=LEAD. */
  customFields: Record<string, unknown>;
  createdAt: string;
}

export interface ConvertLeadResponse {
  lead: Lead;
  accountId: string;
  opportunityId: string;
}

export type LeadQuery = NonNullable<Paths['/crm/leads']['get']['parameters']['query']>;
// See CreateAccountInput's comment — ApiPaths hasn't been regenerated for Phase 2's customFields.
export type CreateLeadInput = Paths['/crm/leads']['post']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
};
export type UpdateLeadInput = Paths['/crm/leads/{id}']['patch']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
};
export type ConvertLeadInput = Paths['/crm/leads/{id}/convert']['post']['requestBody']['content']['application/json'];

// -- Pipelines / Stages -----------------------------------------------------

export interface Pipeline {
  id: string;
  name: string;
  lineOfBusiness: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  defaultProbability: number;
  isWon: boolean;
  isLost: boolean;
}

export interface PipelineDetail extends Pipeline {
  stages: PipelineStage[];
}

export interface CreatePipelineInput {
  name: string;
  lineOfBusiness?: string;
  isActive?: boolean;
}

export interface UpdatePipelineInput {
  name?: string;
  lineOfBusiness?: string;
  isActive?: boolean;
}

export interface CreatePipelineStageInput {
  name: string;
  order: number;
  defaultProbability: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface UpdatePipelineStageInput {
  name?: string;
  order?: number;
  defaultProbability?: number;
  isWon?: boolean;
  isLost?: boolean;
}

// -- Opportunities ------------------------------------------------------------

export interface Opportunity {
  id: string;
  accountId: string;
  name: string;
  pipelineStageId: string;
  /** Decimal amount serialized as a string, e.g. "45000000.00". */
  amount: string;
  /** ISO 4217 code, defaults "NGN" — see ExchangeRate for how non-NGN amounts get normalized into dashboard/report totals. */
  currency: string;
  probability: number;
  expectedCloseDate: string;
  actualCloseDate: string | null;
  wonReason: string | null;
  lostReason: string | null;
  ownerId: string;
  lineOfBusiness: string | null;
  /** Composite "on track" signal — see refresh-deal-health.job.ts. Null for closed deals or before the first scoring run. Distinct from `probability`. */
  dealHealthScore: number | null;
  dealHealthScoreComputedAt: string | null;
  /** Phase 2 — jsonb, keyed by active CustomFieldDefinition.key for entityType=OPPORTUNITY. */
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StageHistoryEntry {
  changedAt: string;
  actorName: string | null;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string | null;
  toStageName: string | null;
}

export type OpportunityQuery = NonNullable<Paths['/crm/opportunities']['get']['parameters']['query']>;
// See CreateAccountInput's comment — ApiPaths hasn't been regenerated for
// Phase 2's customFields, or (same reasoning) for `currency` (multi-currency
// support, added directly to CreateOpportunityDto/UpdateOpportunityDto).
export type CreateOpportunityInput = Paths['/crm/opportunities']['post']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
  currency?: string;
};
export type UpdateOpportunityInput = Paths['/crm/opportunities/{id}']['patch']['requestBody']['content']['application/json'] & {
  customFields?: Record<string, unknown>;
  currency?: string;
};
export type UpdateOpportunityStageInput =
  Paths['/crm/opportunities/{id}/stage']['patch']['requestBody']['content']['application/json'];

// -- Market submissions -------------------------------------------------------

export interface MarketSubmission {
  id: string;
  opportunityId: string;
  carrierId: string;
  quotedPremium: string | null;
  status: 'SUBMITTED' | 'DECLINED' | 'QUOTED' | 'BOUND';
  submittedAt: string;
  respondedAt: string | null;
  notes: string | null;
}

export type CreateMarketSubmissionInput =
  Paths['/crm/opportunities/{id}/market-submissions']['post']['requestBody']['content']['application/json'];

// -- Activities ---------------------------------------------------------------

export interface Activity {
  id: string;
  accountId: string | null;
  contactId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  policyId: string | null;
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'WHATSAPP' | 'PORTAL_MESSAGE' | 'SMS';
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  subject: string;
  body: string | null;
  occurredAt: string;
  createdById: string;
  durationMinutes: number | null;
  outcome: string | null;
  createdAt: string;
}

export type ActivityQuery = NonNullable<Paths['/crm/activities']['get']['parameters']['query']>;
export type CreateActivityInput = Paths['/crm/activities']['post']['requestBody']['content']['application/json'];

// -- Tasks ----------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assigneeId: string;
  accountId: string | null;
  policyId: string | null;
  opportunityId: string | null;
  leadId: string | null;
  caseId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskQuery = NonNullable<Paths['/crm/tasks']['get']['parameters']['query']>;
export type CreateTaskInput = Paths['/crm/tasks']['post']['requestBody']['content']['application/json'];
export type UpdateTaskInput = Paths['/crm/tasks/{id}']['patch']['requestBody']['content']['application/json'];

// -- Identity (read-only directory lookup for owner/assignee display) -------

export interface DirectoryUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
}

// -- Phase 2: Custom field definitions ---------------------------------------
//
// No ApiPaths entries exist for any of the routes below — the OpenAPI schema
// (packages/shared-types/src/api-client/schema.d.ts) hasn't been regenerated
// against Phase 2's backend/api/src/modules/crm/*.controller.ts additions —
// so every type in this section is hand-mirrored from
// backend/api/src/modules/crm/dto/*.ts, same convention as this file's header
// comment already documents for response shapes.

export type CustomFieldEntityType = 'ACCOUNT' | 'CONTACT' | 'LEAD' | 'OPPORTUNITY';
export type CustomFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DECIMAL'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'USER_REFERENCE'
  | 'URL';

/** Admin-managed lookup for Lead.source — replaces what used to be a fixed LeadSource enum. See LeadSource's schema.prisma comment. */
export interface LeadSourceOption {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadSourceInput {
  name: string;
  code: string;
  isActive?: boolean;
  sortOrder?: number;
}

// code excluded — see LeadSourcesController's own comment on why the admin UI doesn't offer renaming it.
export interface UpdateLeadSourceInput {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CustomFieldDefinition {
  id: string;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
  helpText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomFieldDefinitionInput {
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  isActive?: boolean;
  displayOrder?: number;
  helpText?: string;
}

// entityType/key excluded — immutable once other rows may carry values under
// this definition, matches UpdateCustomFieldDefinitionDto exactly.
export interface UpdateCustomFieldDefinitionInput {
  label?: string;
  fieldType?: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  isActive?: boolean;
  displayOrder?: number;
  helpText?: string;
}

// -- Phase 2: Saved views ----------------------------------------------------

// 'CASE' saved views store a full CaseQuery object as `filters`, not a
// FilterTree — see (cases)/_lib/types.ts's CaseSavedView, which cases
// code uses instead of the FilterTree-typed SavedView/CreateSavedViewInput
// below (those two interfaces are never constructed for entityType CASE).
export type SavedViewEntityType = 'ACCOUNT' | 'CONTACT' | 'LEAD' | 'OPPORTUNITY' | 'TASK' | 'CASE';
export type SavedViewVisibility = 'PRIVATE' | 'TEAM' | 'DEPARTMENT' | 'ORG';

/** Mirrors saved-view-filters.ts's FilterOperator — kept in sync manually. */
export type FilterOperator = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'contains';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface FilterTree {
  op: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SavedView {
  id: string;
  entityType: SavedViewEntityType;
  name: string;
  ownerId: string;
  visibility: SavedViewVisibility;
  teamId: string | null;
  filters: FilterTree;
  sort: SortSpec[] | null;
  columns: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedViewInput {
  entityType: SavedViewEntityType;
  name: string;
  visibility?: SavedViewVisibility;
  teamId?: string;
  filters: FilterTree;
  sort?: SortSpec[];
  columns?: string[];
  isDefault?: boolean;
}

export type UpdateSavedViewInput = Partial<Omit<CreateSavedViewInput, 'entityType'>>;

export interface RunSavedViewResult<T> {
  total: number;
  rows: T[];
}

// -- Phase 2: Sales quotas ----------------------------------------------------

export type QuotaScopeType = 'USER' | 'DEPARTMENT' | 'BRANCH' | 'ORG';
export type QuotaPeriodType = 'MONTH' | 'QUARTER' | 'YEAR';

export interface SalesQuota {
  id: string;
  scopeType: QuotaScopeType;
  userId: string | null;
  departmentId: string | null;
  branchId: string | null;
  periodType: QuotaPeriodType;
  periodStart: string;
  periodEnd: string;
  /** Decimal amount serialized as a string, e.g. "5000000.00". */
  targetAmount: string;
  lineOfBusiness: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalesQuotaInput {
  scopeType: QuotaScopeType;
  userId?: string;
  departmentId?: string;
  branchId?: string;
  periodType: QuotaPeriodType;
  /** YYYY-MM-DD */
  periodStart: string;
  /** YYYY-MM-DD */
  periodEnd: string;
  targetAmount: string;
  lineOfBusiness?: string;
}

export type UpdateSalesQuotaInput = Partial<CreateSalesQuotaInput>;

/** Reference data for the DEPARTMENT/BRANCH sales quota scope pickers —
 * sourced from the admin-scoped /api/admin/departments and /api/admin/branches
 * BFF routes (no CRM-scoped equivalent exists, and sales_quota:write is
 * already ADMIN-tier only, so reusing them directly needs no new backend). */
export interface DepartmentRef {
  id: string;
  name: string;
}

export interface BranchRef {
  id: string;
  name: string;
}

export interface QuotaAttainment {
  targetAmount: string;
  wonAmount: string;
  attainmentPct: number;
}

// -- Phase 2: Duplicate detection & merge -------------------------------------

export type DuplicateTier = 'EXACT' | 'STRONG' | 'POSSIBLE';

export interface DuplicateMatch {
  id: string;
  displayName: string;
  matchedOn: string[];
}

export interface DuplicateGroup {
  tier: DuplicateTier;
  matches: DuplicateMatch[];
}

// Type aliases (not interfaces) so they satisfy buildQuery's Record
// parameter via TS's implicit index signature on object type literals.
export type CheckAccountDuplicatesQuery = {
  name?: string;
  email?: string;
  phone?: string;
};

export type CheckContactOrLeadDuplicatesQuery = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** LEAD only. */
  companyName?: string;
};

export interface MergeResponse {
  winnerId: string;
  loserId: string;
}

// -- Phase 2: Bulk actions -----------------------------------------------------

export interface BulkActionResponse {
  requested: string[];
  updated: string[];
  skipped: string[];
}

export interface BulkAssignInput {
  ids: string[];
  /** Account/Opportunity bulk/assign body key. */
  ownerId?: string;
  /** Contact bulk/assign body key. */
  accountId?: string;
  /** Lead bulk/assign body key. */
  assignedToId?: string;
}

export interface BulkDeleteInput {
  ids: string[];
}

export interface LoyaltyAccount {
  id: string;
  accountId: string;
  accountName?: string;
  tier: string;
  pointsBalance: number;
  enrolledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  loyaltyAccountId: string;
  type: 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE';
  points: number;
  reason: string;
  relatedPolicyId: string | null;
  createdById: string | null;
  createdByName?: string | null;
  createdAt: string;
}
