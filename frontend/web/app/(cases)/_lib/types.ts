/**
 * Case Management data shapes for app/(cases)/**.
 *
 * `@topiadesk/shared-types`'s generated `ApiPaths` (see
 * packages/shared-types/src/api-client/schema.d.ts) does not yet cover the
 * Phase 2 case-management routes (claims/cases/sla-policies/macros/
 * assignment-rules/...) — that schema is only regenerated against
 * backend/api's live OpenAPI doc on demand, and this batch landed after the
 * last regeneration. Every shape below is hand-mirrored straight from
 * backend/api/src/modules/case-management/dto/*.ts instead, following the
 * same "keep in sync manually" convention documented in
 * packages/shared-types/src/enums.ts and app/(crm)/_lib/types.ts.
 */

// ---------------------------------------------------------------------------
// Enums (packages/db/prisma/schema.prisma — Phase 2 Case Management section)
// ---------------------------------------------------------------------------

export const CLAIM_STATUSES = ['NOTIFIED', 'UNDER_REVIEW', 'ADJUSTED', 'SETTLED', 'REPUDIATED', 'REOPENED', 'WITHDRAWN'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CASE_TYPES = ['ENQUIRY', 'SERVICE_REQUEST', 'COMPLAINT'] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATUSES = ['NEW', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_CARRIER', 'RESOLVED', 'CLOSED', 'REOPENED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export const CASE_MANAGEMENT_ENTITY_TYPES = ['CLAIM', 'CASE', 'LEAD'] as const;
export type CaseManagementEntityType = (typeof CASE_MANAGEMENT_ENTITY_TYPES)[number];

export const SLA_METRIC_TYPES = ['FIRST_RESPONSE', 'RESOLUTION', 'STAGE_TRANSITION'] as const;
export type SlaMetricType = (typeof SLA_METRIC_TYPES)[number];

export const SLA_CLOCK_STATUSES = ['RUNNING', 'PAUSED', 'SATISFIED', 'BREACHED'] as const;
export type SlaClockStatus = (typeof SLA_CLOCK_STATUSES)[number];

export const ASSIGNMENT_STRATEGIES = ['ROUND_ROBIN', 'LOAD_BASED', 'SKILL_BASED'] as const;
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number];

export const CASE_LINK_TYPES = ['PARENT_CHILD', 'MERGED'] as const;
export type CaseLinkType = (typeof CASE_LINK_TYPES)[number];

/** Reuses CRM's Activity type/direction enums — Comment threading on Claim/Case is Activity rows with claimId/caseId set, see comment.dto.ts. */
export const COMMENT_ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'WHATSAPP', 'PORTAL_MESSAGE', 'SMS', 'SOCIAL', 'LIVE_CHAT'] as const;
export type CommentActivityType = (typeof COMMENT_ACTIVITY_TYPES)[number];
export const COMMENT_ACTIVITY_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'INTERNAL'] as const;
export type CommentActivityDirection = (typeof COMMENT_ACTIVITY_DIRECTIONS)[number];

/**
 * Mirrors backend/api/src/modules/case-management/claim-lifecycle.ts's
 * CLAIM_STATUS_TRANSITIONS — kept in sync manually, same convention as
 * app/(policy)/lib/types.ts's POLICY_STATUS_TRANSITIONS. Drives which
 * options ClaimLifecycleActions offers; the backend re-validates on every
 * write regardless.
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

/** Mirrors case-lifecycle.ts's CASE_STATUS_TRANSITIONS. */
export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ['OPEN', 'CLOSED'],
  OPEN: ['PENDING_CUSTOMER', 'PENDING_CARRIER', 'RESOLVED', 'CLOSED'],
  PENDING_CUSTOMER: ['OPEN', 'RESOLVED', 'CLOSED'],
  PENDING_CARRIER: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN'],
};

/** Mirrors case-lifecycle.ts's PENDING_CASE_STATUSES — the reversible-hold statuses that pause the RESOLUTION SlaClock. */
export const PENDING_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set(['PENDING_CUSTOMER', 'PENDING_CARRIER']);

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export interface Claim {
  id: string;
  claimNumber: string;
  policyId: string;
  status: ClaimStatus;
  priority: CasePriority;
  dateOfLoss: string;
  dateReported: string;
  causeOfLoss: string | null;
  causeOfLossCategoryId: string | null;
  reserveAmount: string | null;
  settledAmount: string | null;
  settledAt: string | null;
  repudiationReason: string | null;
  adjusterId: string | null;
  assignedTeamId: string | null;
  slaPolicyId: string | null;
  catastropheEventId: string | null;
  parentClaimId: string | null;
  externalAdjusterRef: string | null;
  reopenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimStatusHistoryEntry {
  id: string;
  claimId: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  changedById: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * A `type` alias (not `interface`) is deliberate here — TypeScript only
 * grants a fresh object type an implicit string index signature (needed to
 * satisfy _lib/api.ts's `buildQuery(params: Record<string, ...>)`) when
 * it's declared via `type`, not `interface` (interfaces are extensible
 * elsewhere, so TS can't guarantee they stay index-signature-compatible).
 * Same convention every other buildQuery-fed query shape in this codebase
 * follows (e.g. app/(crm)/_lib/types.ts's `AccountQuery`).
 */
export type ClaimQuery = {
  status?: ClaimStatus;
  priority?: CasePriority;
  adjusterId?: string;
  policyId?: string;
  assignedTeamId?: string;
  /** Free-text across claim number and cause of loss. */
  q?: string;
  catastropheEventId?: string;
  /** Date of loss window, ISO 8601. */
  lossFrom?: string;
  lossTo?: string;
  take?: number;
  skip?: number;
};

/**
 * GET /claims/stats. Reserve and settled are reported separately on purpose
 * — reserve is live exposure, settled is money already paid; combining them
 * would be meaningless. Both are normalized into `baseCurrency` server-side,
 * since Claim inherits Policy.currency and a mixed-currency book cannot be
 * raw-summed.
 */
export interface ClaimStats {
  total: number;
  open: number;
  settled: number;
  repudiated: number;
  reopened: number;
  baseCurrency: string;
  outstandingReserve: number;
  totalSettled: number;
}

/** GET /cases/stats — `open` spans every non-terminal status, not just OPEN. */
export interface CaseStats {
  total: number;
  newCount: number;
  open: number;
  resolved: number;
  closed: number;
  unassigned: number;
  breaching: number;
}

export interface CreateClaimInput {
  claimNumber: string;
  policyId: string;
  priority?: CasePriority;
  dateOfLoss: string;
  dateReported?: string;
  causeOfLoss?: string;
  causeOfLossCategoryId?: string;
  reserveAmount?: string;
  adjusterId?: string;
  assignedTeamId?: string;
  slaPolicyId?: string;
  catastropheEventId?: string;
  parentClaimId?: string;
  externalAdjusterRef?: string;
}

export interface UpdateClaimInput {
  priority?: CasePriority;
  causeOfLoss?: string;
  causeOfLossCategoryId?: string;
  reserveAmount?: string;
  settledAmount?: string;
  repudiationReason?: string;
  adjusterId?: string;
  assignedTeamId?: string;
  catastropheEventId?: string;
  externalAdjusterRef?: string;
}

export interface ChangeClaimStatusInput {
  status: ClaimStatus;
  reason?: string;
  settledAmount?: string;
}

export interface ReopenClaimInput {
  reason: string;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export interface Case {
  id: string;
  caseNumber: string;
  caseType: CaseType;
  categoryId: string | null;
  subject: string;
  description: string | null;
  status: CaseStatus;
  priority: CasePriority;
  accountId: string | null;
  contactId: string | null;
  policyId: string | null;
  assignedToId: string | null;
  assignedTeamId: string | null;
  /** The requester/filer — distinct from assignedToId. Null for system/omnichannel-originated cases. */
  createdById: string | null;
  slaPolicyId: string | null;
  parentCaseId: string | null;
  linkType: CaseLinkType | null;
  reopenCount: number;
  sourceChannel: CommentActivityType | null;
  firstRespondedAt: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DATE_RANGE_PRESETS = ['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH'] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const RESOLUTION_DUE_BY_PRESETS = ['OVERDUE', 'DUE_TODAY', 'DUE_THIS_WEEK'] as const;
export type ResolutionDueByPreset = (typeof RESOLUTION_DUE_BY_PRESETS)[number];

/** `type`, not `interface` — see ClaimQuery's comment above on buildQuery's implicit-index-signature requirement. Mirrors CaseQueryDto (backend/api/src/modules/case-management/dto/case.dto.ts) 1:1 — the ticket workspace's saved views + filters panel resolve into this shape. */
export type CaseQuery = {
  status?: CaseStatus;
  priority?: CasePriority;
  caseType?: CaseType;
  assignedToId?: string;
  assignedTeamId?: string;
  accountId?: string;
  categoryId?: string;
  parentCaseId?: string;
  assignedToIds?: string[];
  assignedTeamIds?: string[];
  statuses?: CaseStatus[];
  excludeStatuses?: CaseStatus[];
  priorities?: CasePriority[];
  myTeams?: boolean;
  raisedByUserId?: string;
  watchingUserId?: string;
  newOrMine?: boolean;
  undeliveredOnly?: boolean;
  resolutionDueBy?: ResolutionDueByPreset;
  createdPreset?: DateRangePreset;
  closedPreset?: DateRangePreset;
  resolvedPreset?: DateRangePreset;
  search?: string;
  skip?: number;
  take?: number;
  sortBy?: 'createdAt' | 'priority' | 'status';
  sortDir?: 'asc' | 'desc';
};

/** `type`, not `interface` — see ClaimQuery's comment above. */
export type CaseQueueQuery = {
  teamId?: string;
};

// ---------------------------------------------------------------------------
// Saved views (tickets) — a real, RLS-isolated saved filter, distinct from
// TICKET_VIEWS' fixed shared presets (ticket-views.ts). Stores a full
// CaseQuery object as `filters` (not the generic CRM SavedView's FilterTree
// — Case filtering has OR-conditions/joins/date presets a flat filter tree
// can't express), so this type intentionally does NOT reuse (crm)/_lib/
// types.ts's SavedView/CreateSavedViewInput interfaces.

export type SavedViewVisibility = 'PRIVATE' | 'TEAM' | 'DEPARTMENT' | 'ORG';

export interface CaseSavedView {
  id: string;
  entityType: 'CASE';
  name: string;
  ownerId: string;
  visibility: SavedViewVisibility;
  teamId: string | null;
  filters: CaseQuery;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCaseSavedViewInput {
  name: string;
  visibility: SavedViewVisibility;
  teamId?: string;
  filters: CaseQuery;
}

export interface CreateCaseInput {
  caseType: CaseType;
  categoryId?: string;
  subject: string;
  description?: string;
  priority?: CasePriority;
  accountId?: string;
  contactId?: string;
  policyId?: string;
  assignedToId?: string;
  assignedTeamId?: string;
  slaPolicyId?: string;
  sourceChannel?: CommentActivityType;
}

export interface UpdateCaseInput {
  categoryId?: string;
  subject?: string;
  description?: string;
  priority?: CasePriority;
  accountId?: string;
  contactId?: string;
  policyId?: string;
  assignedToId?: string;
  assignedTeamId?: string;
  slaPolicyId?: string;
  sourceChannel?: CommentActivityType;
}

export interface ChangeCaseStatusInput {
  status: CaseStatus;
  reason?: string;
}

/** Closing a COMPLAINT case requires a second, non-requester approver — see cases.controller.ts's request-closure/closure-decision endpoints. */
export interface CaseClosureApproval {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedById: string;
  approvedById: string | null;
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface RequestCaseClosureInput {
  reason?: string;
}

export interface DecideCaseClosureInput {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
}

export interface LinkChildCaseInput {
  childCaseId: string;
}

export interface MergeCaseInput {
  targetCaseId: string;
}

// ---------------------------------------------------------------------------
// Comments (Activity rows scoped by claimId/caseId) + Watchers
// ---------------------------------------------------------------------------

export interface CaseComment {
  id: string;
  claimId: string | null;
  caseId: string | null;
  type: CommentActivityType;
  direction: CommentActivityDirection;
  subject: string;
  body: string | null;
  occurredAt: string;
  createdById: string | null;
  createdBySystemJob: string | null;
  /** Only set for OUTBOUND comments on a Case — see comment.dto.ts. */
  emailDeliveryStatus?: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED_NO_EMAIL' | null;
  /** Actual recipients once the email sends (explicit or auto-resolved) — empty until then. */
  emailTo: string[];
  emailCc: string[];
  createdAt: string;
}

export interface CreateCommentInput {
  subject: string;
  body?: string;
  type?: CommentActivityType;
  direction?: CommentActivityDirection;
  occurredAt?: string;
  /** Explicit recipient override for an OUTBOUND Case email (SendCaseEmailDialog) — omit to fall back to the case's auto-resolved contact email. */
  emailTo?: string[];
  emailCc?: string[];
}

export interface CaseWatcher {
  id: string;
  claimId: string | null;
  caseId: string | null;
  userId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// SLA policies + targets
// ---------------------------------------------------------------------------

export interface SlaTarget {
  id: string;
  slaPolicyId: string;
  metricType: SlaMetricType;
  fromStatus: string | null;
  toStatus: string | null;
  targetMinutes: number;
  escalateAfterMinutes: number | null;
  escalateToUserId: string | null;
  escalateToTeamId: string | null;
  /** Same ActionSpec[] vocabulary as Macro/AutomationRule actions (see
   * ActionSpec below) — empty/absent means the backend's hardcoded
   * notify-the-assignee/escalateTo behavior. */
  onBreachActions?: ActionSpec[] | null;
  onEscalateActions?: ActionSpec[] | null;
}

export interface CreateSlaTargetInput {
  metricType: SlaMetricType;
  fromStatus?: string;
  toStatus?: string;
  targetMinutes: number;
  escalateAfterMinutes?: number;
  escalateToUserId?: string;
  escalateToTeamId?: string;
  onBreachActions?: ActionSpec[];
  onEscalateActions?: ActionSpec[];
}

export type UpdateSlaTargetInput = Partial<CreateSlaTargetInput>;

/**
 * Mirrors SlaClockResponseDto (backend/api/src/modules/case-management/dto/
 * sla-policy.dto.ts). NOT embedded on Case/Claim's own response shape —
 * confirmed against case.dto.ts/claim.dto.ts's CaseResponseDto/
 * ClaimResponseDto, neither of which carries a clocks/slaClocks field. The
 * only read path is GET /sla-policies/:id/clocks, scoped by POLICY id (not
 * case/claim id) and gated on 'sla_config':'read' (ADMIN/COMPLIANCE_OFFICER
 * only, see packages/db/prisma/seed.ts — ACCOUNT_HANDLER/MANAGER hold no
 * grant for this resource at any scope). hooks.ts's useSlaClocksByPolicyIds
 * fetches each distinct policy's clock list once and joins client-side by
 * this row's own claimId/caseId field.
 */
export interface SlaClock {
  id: string;
  claimId: string | null;
  caseId: string | null;
  slaTargetId: string;
  status: SlaClockStatus;
  startedAt: string;
  dueAt: string;
  pausedAt: string | null;
  totalPausedMinutes: number;
  satisfiedAt: string | null;
  breachedAt: string | null;
  escalatedAt: string | null;
}

export interface SlaPolicy {
  id: string;
  name: string;
  entityType: CaseManagementEntityType;
  caseType: CaseType | null;
  priority: CasePriority | null;
  businessHoursCalendarId: string | null;
  isActive: boolean;
  /** Tiebreak rank when two policies match a case equally specifically — higher wins. */
  rank: number;
  createdAt: string;
  updatedAt: string;
  targets?: SlaTarget[];
}

export interface CreateSlaPolicyInput {
  name: string;
  entityType: CaseManagementEntityType;
  caseType?: CaseType;
  priority?: CasePriority;
  businessHoursCalendarId?: string;
  isActive?: boolean;
  rank?: number;
  targets?: CreateSlaTargetInput[];
}

export interface UpdateSlaPolicyInput {
  name?: string;
  caseType?: CaseType;
  priority?: CasePriority;
  businessHoursCalendarId?: string;
  isActive?: boolean;
  rank?: number;
}

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

export const MACRO_ACTION_TYPES = ['SET_STATUS', 'ASSIGN_TO_USER', 'ASSIGN_TO_TEAM', 'SET_PRIORITY', 'ADD_INTERNAL_NOTE', 'SEND_NOTIFICATION'] as const;
export type MacroActionType = (typeof MACRO_ACTION_TYPES)[number];

export interface ActionSpec {
  actionType: string;
  params: Record<string, unknown>;
}

export interface Macro {
  id: string;
  name: string;
  description: string | null;
  /** Free-text grouping label (e.g. "Renewals", "Escalations") — see macros-list-view.tsx's category grouping and macro-form-dialog.tsx's datalist-backed input. */
  category: string | null;
  entityType: CaseManagementEntityType | null;
  actions: ActionSpec[];
  isActive: boolean;
  usageCount: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMacroInput {
  name: string;
  description?: string;
  category?: string;
  entityType?: CaseManagementEntityType;
  actions: ActionSpec[];
  isActive?: boolean;
}

export interface UpdateMacroInput {
  name?: string;
  description?: string;
  category?: string;
  entityType?: CaseManagementEntityType;
  actions?: ActionSpec[];
  isActive?: boolean;
}

export interface MacroPreviewChange {
  actionType: string;
  description: string;
  currentValue?: unknown;
  newValue?: unknown;
}

export interface MacroPreviewResponse {
  macroId: string;
  entityType: 'CLAIM' | 'CASE';
  entityId: string;
  changes: MacroPreviewChange[];
}

export interface ApplyMacroResponse {
  macroId: string;
  entityType: string;
  entityId: string;
  results: unknown[];
}

// ---------------------------------------------------------------------------
// Assignment rules
// ---------------------------------------------------------------------------

export interface AssignmentRule {
  id: string;
  name: string;
  entityType: CaseManagementEntityType;
  strategy: AssignmentStrategy;
  conditions: unknown;
  candidatePoolTeamId: string | null;
  requiredSkillTags: string[];
  priority: number;
  isActive: boolean;
  lastAssignedUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssignmentRuleInput {
  name: string;
  entityType: CaseManagementEntityType;
  strategy: AssignmentStrategy;
  conditions?: Record<string, unknown>;
  candidatePoolTeamId?: string;
  requiredSkillTags?: string[];
  priority?: number;
  isActive?: boolean;
}

export interface UpdateAssignmentRuleInput {
  name?: string;
  strategy?: AssignmentStrategy;
  conditions?: Record<string, unknown>;
  candidatePoolTeamId?: string;
  requiredSkillTags?: string[];
  priority?: number;
  isActive?: boolean;
}

export interface AssignmentTestResponse {
  ruleId: string;
  userId: string | null;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Business rules — no-code field logic ("if condition, then require/hide/
// readonly/set-value on these fields"). CASE only in v1 (see the model's
// doc comment in schema.prisma). CONDITION_FIELDS/ACTION_FIELDS mirror
// backend/api/src/modules/case-management/business-rules.validator.ts's
// exports of the same name — kept in sync by hand; a field added to one
// without the other means the rule dialog offers an option the server then
// rejects, or vice versa.
//
// The KEYS are deliberately a subset, not a mirror. The shared
// CaseManagementEntityType enum gained POLICY/OPPORTUNITY/TASK/ACCOUNT/
// CONTACT so AutomationRunState could carry a multi-step workflow on any
// entity type. Business rules are a form-behaviour engine over the case and
// claim forms and model none of those, so listing them here would make this
// dialog offer entity types the server has no rules for. The backend's own
// maps carry them as empty arrays purely to stay total over the enum.
// ---------------------------------------------------------------------------

export const BUSINESS_RULE_OPERATORS = ['EQUALS', 'NOT_EQUALS'] as const;
export type BusinessRuleOperator = (typeof BUSINESS_RULE_OPERATORS)[number];

export const BUSINESS_RULE_ACTION_EFFECTS = ['REQUIRE', 'HIDE', 'READONLY', 'SET_VALUE'] as const;
export type BusinessRuleActionEffect = (typeof BUSINESS_RULE_ACTION_EFFECTS)[number];

export const BUSINESS_RULE_CONDITION_FIELDS: Record<CaseManagementEntityType, readonly string[]> = {
  CASE: ['status', 'priority', 'caseType', 'categoryId', 'assignedTeamId'],
  CLAIM: ['status', 'priority', 'assignedTeamId'],
  // Business rules don't support LEAD — present so this stays a total
  // Record over the shared enum, same "empty but representable" precedent
  // CLAIM's own action list already sets.
  LEAD: [],
};

export const BUSINESS_RULE_ACTION_FIELDS: Record<CaseManagementEntityType, readonly string[]> = {
  CASE: ['caseType', 'subject', 'description', 'priority', 'categoryId', 'accountId', 'policyId', 'assignedToId'],
  CLAIM: [],
  LEAD: [],
};

export interface BusinessRuleAction {
  field: string;
  effect: BusinessRuleActionEffect;
  value?: string;
}

export interface BusinessRule {
  id: string;
  entityType: CaseManagementEntityType;
  name: string;
  description: string | null;
  conditionField: string;
  conditionOperator: BusinessRuleOperator;
  conditionValue: string;
  actions: BusinessRuleAction[];
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBusinessRuleInput {
  entityType: CaseManagementEntityType;
  name: string;
  description?: string;
  conditionField: string;
  conditionOperator: BusinessRuleOperator;
  conditionValue: string;
  actions: BusinessRuleAction[];
  isActive?: boolean;
  displayOrder?: number;
}

export interface UpdateBusinessRuleInput {
  name?: string;
  description?: string;
  conditionField?: string;
  conditionOperator?: BusinessRuleOperator;
  conditionValue?: string;
  actions?: BusinessRuleAction[];
  isActive?: boolean;
  displayOrder?: number;
}

// ---------------------------------------------------------------------------
// Business hours calendars + holidays, agent skills, case categories, loss
// cause categories. Admin/config tier (same 'sla_config'/'case'/'claim'
// write-gating as SLA policies/macros — see each *.controller.ts's header
// comment). Full CRUD pages live under app/(cases)/business-hours,
// agent-skills, case-categories, loss-cause-categories; the read-only
// list hooks below are also reused as lookups feeding selects on the SLA
// policy / claim / case forms.
// ---------------------------------------------------------------------------

/** Mirrors backend/api/src/modules/case-management/business-hours.util.ts's WeekdayKey/DayWindow/WeeklyHours. */
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** "HH:mm", 24h, interpreted in the calendar's timezone. */
export interface DayWindow {
  start: string;
  end: string;
}

/** A day absent from the map (or `null`) is closed all day. One window per day — no split shifts. */
export type WeeklyHours = Partial<Record<WeekdayKey, DayWindow | null>>;

export interface BusinessHoursCalendar {
  id: string;
  name: string;
  timezone: string;
  weeklyHours: WeeklyHours;
  isDefault: boolean;
}

export interface CreateBusinessHoursCalendarInput {
  name: string;
  timezone: string;
  weeklyHours: WeeklyHours;
  isDefault?: boolean;
}

export type UpdateBusinessHoursCalendarInput = Partial<CreateBusinessHoursCalendarInput>;

export interface BusinessHoliday {
  id: string;
  calendarId: string;
  /** Calendar-day date, `YYYY-MM-DD` (no time-of-day/timezone) — see BusinessHolidayResponseDto. */
  date: string;
  name: string;
}

export interface CreateBusinessHolidayInput {
  date: string;
  name: string;
}

export type UpdateBusinessHolidayInput = Partial<CreateBusinessHolidayInput>;

export interface AgentSkill {
  id: string;
  userId: string;
  skillTag: string;
  proficiency: number | null;
}

export interface CreateAgentSkillInput {
  userId: string;
  skillTag: string;
  proficiency?: number;
}

export type UpdateAgentSkillInput = Partial<CreateAgentSkillInput>;

export interface CaseCategory {
  id: string;
  name: string;
  code: string;
  caseType: CaseType | null;
  /** Self-relation for a nested hierarchy — null means top-level. See _lib/category-tree.ts for the client-side flat-list-to-tree walk (the backend keeps this flat, same convention as Knowledge's category tree). */
  parentId: string | null;
  /** Guaranteed to run on CASE CREATED for this category, independent of
   * the rule's own stored conditions — see automation-events.queue.ts's
   * processEntityEvent. */
  defaultWorkflowId: string | null;
}

export interface CreateCaseCategoryInput {
  name: string;
  code: string;
  caseType?: CaseType;
  parentId?: string | null;
  defaultWorkflowId?: string | null;
}

export type UpdateCaseCategoryInput = Partial<CreateCaseCategoryInput>;

/** Lightweight reference for the "Default workflow" picker on the Case
 * Category form — sourced from the same GET /crm/automation-rules
 * endpoint the admin Workflow Builder already reads (via its BFF proxy,
 * reachable cross-route-group same as every other apiFetch in this app),
 * filtered client-side to CASE-entityType rules the same way
 * workflows-list-view.tsx's isWorkflowRule() already does. */
export interface WorkflowRuleRef {
  id: string;
  name: string;
  status: string;
  conditions: unknown;
}

export interface LossCauseCategory {
  id: string;
  name: string;
  code: string;
  /** Self-relation for a nested hierarchy — null means top-level. See CaseCategory's doc comment above. */
  parentId: string | null;
}

export interface CreateLossCauseCategoryInput {
  name: string;
  code: string;
  parentId?: string | null;
}

export type UpdateLossCauseCategoryInput = Partial<CreateLossCauseCategoryInput>;

// ---------------------------------------------------------------------------
// Shared lookup shapes
// ---------------------------------------------------------------------------

/** id -> name/email directory entry — see app/api/identity-users/route.ts (built by the Policy batch, reused read-only here). */
export interface UserOption {
  id: string;
  fullName: string;
  email: string;
}

/** Minimal id/name projections for filter dropdowns — see app/api/policy-lookups/route.ts's `policies` array (extended by this batch to serve the claim/case "policyId" select). */
export interface LookupOption {
  id: string;
  name: string;
}

/** id -> name directory entry for Team (see backend/api/src/modules/identity/dto/team.dto.ts's TeamResponseDto) — see app/api/identity-teams/route.ts. Used by the assignment rule form's "candidate pool team" picker; only `id`/`name` are needed there, so the BFF route trims the rest. */
export interface TeamOption {
  id: string;
  name: string;
}

/** Local copy of app/(crm)/_lib/types.ts's LeadSourceOption — used by the assignment rule form's LEAD "source" condition picker (see _components/assignment-rule-form-dialog.tsx). Admin-managed lookup, not a fixed enum — see LeadSource's schema.prisma comment. */
export interface LeadSourceOption {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Permissions — Case Config button-gating (see hooks.ts's useCan()).
// Mirrors backend/api/src/modules/identity/dto/current-user-response.dto.ts's
// ResolvedPermissionDto, itself modeled on app_max_scope()
// (packages/db/prisma/rls/002_policies.sql).
// ---------------------------------------------------------------------------

export type PermissionScope = 'OWN' | 'DEPARTMENT' | 'BRANCH' | 'ALL';

export interface ResolvedPermission {
  resource: string;
  action: 'read' | 'write';
  scope: PermissionScope;
}
