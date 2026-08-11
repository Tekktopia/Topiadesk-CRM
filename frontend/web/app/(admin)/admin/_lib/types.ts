import type { ApiPaths } from '@topiadesk/shared-types';

/**
 * Response/request DTO shapes for the Admin domain, derived directly from
 * the live-API-generated `ApiPaths` (packages/shared-types/src/api-client/
 * schema.d.ts) instead of hand-written interfaces — see backend/api/src/
 * modules/identity/*.controller.ts and dto/*.ts for the source of truth
 * these mirror. Indexed-access types stay correct automatically whenever
 * the schema is regenerated; no manual sync needed.
 *
 * KNOWN GENERATOR GAP (verified by reading the generated schema directly):
 * every DTO field declared as `@ApiProperty({ nullable: true }) x!: string
 * | null` comes out of nestjs/swagger + openapi-typescript as
 * `Record<string, never> | null` instead of `string | null` — a union TS
 * type on the property defeats swagger's design:type reflection, so it
 * falls back to an empty-object schema. The runtime values are always
 * plain strings or null (confirmed against every affected controller/dto
 * in backend/api/src/modules/identity|integrations|notifications/). Fixing
 * it properly means adding an explicit `type: String` to each decorator in
 * backend/api and regenerating — both out of scope for this build (backend/
 * api and packages/shared-types aren't owned here) — so `NullableString`
 * patches just those specific fields locally via `Omit<Raw, K> & {...}`,
 * everything else still flows straight from the generated schema.
 */
type NullableString = string | null;
type NullableNumber = number | null;

type Json200<P extends keyof ApiPaths, M extends keyof ApiPaths[P]> = ApiPaths[P][M] extends {
  responses: { 200: { content: { 'application/json': infer R } } };
}
  ? R
  : never;

type JsonBody<P extends keyof ApiPaths, M extends keyof ApiPaths[P]> = ApiPaths[P][M] extends {
  requestBody: { content: { 'application/json': infer R } };
}
  ? R
  : never;

// -- Users --------------------------------------------------------------
type RawUserDto = Json200<'/identity/users', 'get'>[number];
export type UserDto = Omit<RawUserDto, 'phone' | 'departmentId' | 'branchId' | 'managerId' | 'positionTitle' | 'lastSyncedAt'> & {
  phone: NullableString;
  departmentId: NullableString;
  branchId: NullableString;
  managerId: NullableString;
  positionTitle: NullableString;
  lastSyncedAt: NullableString;
};

type RawUpdateUserBody = JsonBody<'/identity/users/{id}', 'patch'>;
export type UpdateUserBody = Omit<RawUpdateUserBody, 'departmentId' | 'branchId' | 'managerId' | 'positionTitle'> & {
  departmentId?: NullableString;
  branchId?: NullableString;
  managerId?: NullableString;
  positionTitle?: NullableString;
};

/** POST /identity/users — hand-written, not derived from ApiPaths: this
 * route landed after the last schema regeneration, same "hand-mirror when
 * generation lags" convention this file's header comment documents. Keep
 * in sync with backend/api/src/modules/identity/dto/user.dto.ts's
 * CreateUserDto/CreateUserResponseDto by hand. */
export interface CreateUserBody {
  email: string;
  fullName: string;
  phone?: string;
  departmentId?: string;
  branchId?: string;
  managerId?: string;
  positionTitle?: string;
}

export interface CreateUserResponse {
  user: UserDto;
  temporaryPassword: string;
}

export type AssignRoleBody = JsonBody<'/identity/users/{id}/roles', 'post'>;

/** POST /identity/users/:id/roles returns EITHER UserDto (immediate grant,
 * Role.requiredApprovalsToGrant === 1) OR this (approval-gated). Hand-written
 * rather than derived — the backend's `oneOf` Swagger response for that
 * endpoint doesn't resolve into a clean discriminated union via the
 * generator, same "hand-mirror when the generated shape doesn't fit"
 * convention this file's header comment already documents for
 * NullableString. Distinguish from UserDto at the call site with
 * `'approvedCount' in result` — UserDto never has that field. */
export interface PendingRoleGrantDto {
  id: string;
  userId: string;
  userName: string;
  roleId: string;
  roleName: string;
  requestedById: string;
  requestedByName: string;
  chainId: string;
  approvedCount: number;
  requiredApprovals: number;
  createdAt: string;
}

export interface DecideRoleGrantBody {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
}

/** POST /identity/users/bulk-invite — hand-written, not derived from
 * ApiPaths: this route landed after the last schema regeneration, same
 * "hand-mirror when generation lags" convention this file's header
 * comment documents. Keep in sync with backend/api/src/modules/identity/
 * dto/bulk-invite-users.dto.ts by hand. */
export interface BulkInviteUserRow {
  email: string;
  fullName: string;
  departmentCode?: string;
  branchCode?: string;
}

export interface BulkInviteUsersBody {
  rows: BulkInviteUserRow[];
}

export interface BulkInviteResultRow {
  email: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
}

// -- Roles & permissions --------------------------------------------------
type RawRoleDto = Json200<'/identity/roles', 'get'>[number];
export type RoleDto = Omit<RawRoleDto, 'description'> & { description: NullableString };
export type PermissionSummaryDto = RoleDto['permissions'][number];
export type CreateRoleBody = JsonBody<'/identity/roles', 'post'>;
export type UpdateRoleBody = JsonBody<'/identity/roles/{id}', 'patch'>;
export type GrantPermissionBody = JsonBody<'/identity/roles/{id}/permissions', 'post'>;
export type PermissionDto = Json200<'/identity/permissions', 'get'>[number];

// -- Field-Level Security ---------------------------------------------------
// Hand-written, not ApiPaths-derived — same reasoning as AutomationRuleDto
// above (a new endpoint the generator hasn't seen yet, and even once
// regenerated its bare-nullable-collapse issue would apply to none of these
// fields anyway since they're all plain non-nullable strings).
export type FieldPermissionVisibility = 'HIDDEN' | 'READ_ONLY';
export interface FieldPermissionDto {
  id: string;
  roleId: string;
  resource: string;
  fieldName: string;
  visibility: FieldPermissionVisibility;
  createdAt: string;
}
/** resource -> gate-able field names, from FIELD_PERMISSION_CATALOG (backend/api/src/common/field-permissions/field-visibility.util.ts). */
export type FieldPermissionCatalog = Record<string, string[]>;

// -- Multi-currency ----------------------------------------------------------
// Hand-written, not ApiPaths-derived — same reasoning as the other
// additions in this file.
export interface ExchangeRateDto {
  id: string;
  currencyCode: string;
  rateToBase: string;
  updatedById: string | null;
  updatedAt: string;
}

// -- Departments / branches ------------------------------------------------
type RawDepartmentDto = Json200<'/identity/departments', 'get'>[number];
export type DepartmentDto = Omit<RawDepartmentDto, 'email' | 'phone' | 'parentDepartmentId'> & {
  email: NullableString;
  phone: NullableString;
  parentDepartmentId: NullableString;
};
type RawCreateDepartmentBody = JsonBody<'/identity/departments', 'post'>;
export type CreateDepartmentBody = Omit<RawCreateDepartmentBody, 'email' | 'phone' | 'parentDepartmentId'> & {
  email?: NullableString;
  phone?: NullableString;
  parentDepartmentId?: NullableString;
};
type RawUpdateDepartmentBody = JsonBody<'/identity/departments/{id}', 'patch'>;
export type UpdateDepartmentBody = Omit<RawUpdateDepartmentBody, 'email' | 'phone' | 'parentDepartmentId'> & {
  email?: NullableString;
  phone?: NullableString;
  parentDepartmentId?: NullableString;
};

type RawBranchDto = Json200<'/identity/branches', 'get'>[number];
export type BranchDto = Omit<RawBranchDto, 'address' | 'city' | 'state' | 'country'> & {
  address: NullableString;
  city: NullableString;
  state: NullableString;
  country: NullableString;
};
export type CreateBranchBody = JsonBody<'/identity/branches', 'post'>;
export type UpdateBranchBody = JsonBody<'/identity/branches/{id}', 'patch'>;

// -- Teams ------------------------------------------------------------------
type RawTeamDto = Json200<'/identity/teams', 'get'>[number];
export type TeamDto = Omit<RawTeamDto, 'description'> & { description: NullableString };
type RawTeamDetailDto = Json200<'/identity/teams/{id}', 'get'>;
export type TeamDetailDto = Omit<RawTeamDetailDto, 'description'> & { description: NullableString };
export type TeamMemberDto = NonNullable<TeamDetailDto['members']>[number];
export type CreateTeamBody = JsonBody<'/identity/teams', 'post'>;
export type UpdateTeamBody = JsonBody<'/identity/teams/{id}', 'patch'>;
export type AddTeamMemberBody = JsonBody<'/identity/teams/{id}/members', 'post'>;
export type UpdateTeamMemberBody = JsonBody<'/identity/teams/{id}/members/{userId}', 'patch'>;

// -- Org settings -------------------------------------------------------------
type RawOrgSettingDto = Json200<'/identity/org-settings', 'get'>[number];
export type OrgSettingDto = Omit<RawOrgSettingDto, 'updatedById' | 'value'> & {
  updatedById: NullableString;
  value: unknown;
};
/** The generated `{ [key: string]: unknown }` shape for `value` is too
 * narrow — SetOrgSettingDto's own doc comment says it accepts "object,
 * array, string, number, or boolean", and the Org Settings page really
 * does send arrays (renewal thresholds) and string arrays (MFA roles), not
 * just objects — so this is hand-typed as `unknown` rather than patched
 * from the generated shape. */
export type SetOrgSettingBody = { value: unknown };

// -- IP whitelist ---------------------------------------------------------
type RawIpWhitelistEntryDto = Json200<'/identity/ip-whitelist', 'get'>[number];
export type IpWhitelistEntryDto = Omit<RawIpWhitelistEntryDto, 'description' | 'appliesToRoleId'> & {
  description: NullableString;
  appliesToRoleId: NullableString;
};
type RawCreateIpWhitelistBody = JsonBody<'/identity/ip-whitelist', 'post'>;
export type CreateIpWhitelistBody = Omit<RawCreateIpWhitelistBody, 'appliesToRoleId'> & {
  appliesToRoleId?: NullableString;
};
type RawUpdateIpWhitelistBody = JsonBody<'/identity/ip-whitelist/{id}', 'patch'>;
export type UpdateIpWhitelistBody = Omit<RawUpdateIpWhitelistBody, 'appliesToRoleId'> & {
  appliesToRoleId?: NullableString;
};

// -- Integrations -------------------------------------------------------------
// Hand-typed rather than generated: ConnectorResponseDto grew
// syncDirection/pollingIntervalMinutes/webhookPath/config/createdAt/
// updatedAt and ConnectorType grew TEAMS_WEBHOOK/SEAMLESSHR after this
// file's last codegen cycle — same reasoning as AuditVerifyResponseDto/
// AdminNotificationDto above.
export type ConnectorType =
  | 'CORE_BROKING_SYSTEM'
  | 'ERP'
  | 'MOCK_STUB'
  | 'TEAMS_WEBHOOK'
  | 'SEAMLESSHR'
  | 'PAYSTACK'
  | 'DOJAH'
  | 'WHATSAPP_CLOUD';
export type SyncDirection = 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL';
export interface ConnectorDto {
  id: string;
  name: string;
  connectorType: ConnectorType;
  isEnabled: boolean;
  syncDirection: SyncDirection;
  pollingIntervalMinutes: number | null;
  webhookPath: NullableString;
  config: Record<string, unknown>;
  lastSuccessfulSyncAt: NullableString;
  createdAt: string;
  updatedAt: string;
}
export interface CreateConnectorBody {
  name: string;
  connectorType: ConnectorType;
  syncDirection: SyncDirection;
  isEnabled?: boolean;
  pollingIntervalMinutes?: number;
  webhookPath?: string;
  config: Record<string, unknown>;
}
export type UpdateConnectorBody = Partial<CreateConnectorBody>;

/** GET/PUT /api/admin/sso/microsoft — hand-written, not derived from
 * ApiPaths: this route landed after the last schema regeneration, same
 * "hand-mirror when generation lags" convention this file's header
 * comment documents. Keep in sync with backend/api/src/modules/identity/
 * dto/microsoft-sso.dto.ts by hand. */
export interface MicrosoftSsoDto {
  configured: boolean;
  azureTenantId: string | null;
  azureClientId: string | null;
  isEnabled: boolean;
  redirectUri: string;
}
export interface UpsertMicrosoftSsoBody {
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret?: string;
  isEnabled?: boolean;
}

type RawSyncJobDto = Json200<'/integrations/connectors/{id}/sync-jobs', 'get'>[number];
export type SyncJobDto = Omit<RawSyncJobDto, 'startedAt' | 'completedAt' | 'triggeredBy'> & {
  startedAt: NullableString;
  completedAt: NullableString;
  triggeredBy: NullableString;
};

type RawIntegrationLogDto = Json200<'/integrations/sync-jobs/{id}/logs', 'get'>[number];
export type IntegrationLogDto = Omit<
  RawIntegrationLogDto,
  'syncJobId' | 'externalRecordId' | 'internalEntityType' | 'internalEntityId'
> & {
  syncJobId: NullableString;
  externalRecordId: NullableString;
  internalEntityType: NullableString;
  internalEntityId: NullableString;
};

// -- Notifications --------------------------------------------------------
type RawNotificationDto = Json200<'/notifications', 'get'>[number];
export type NotificationDto = Omit<RawNotificationDto, 'readAt'> & { readAt: NullableString };

// /notifications/admin — org-wide view (NotificationsController.listAdmin()/
// resend()), a new route not yet reflected in the generated schema at the
// time this was written — hand-typed to match AdminNotificationResponseDto
// (backend/api/src/modules/notifications/dto/admin-notification.dto.ts)
// rather than waiting on a codegen cycle, same reasoning as
// AuditVerifyResponseDto above.
export interface AdminNotificationDto {
  id: string;
  recipientUserId: string;
  recipient: { id: string; fullName: string; email: string };
  type: string;
  title: string;
  body: string;
  channel: 'IN_APP' | 'EMAIL' | 'SMS';
  status: 'PENDING' | 'SENT' | 'FAILED' | 'READ';
  relatedEntityType: NullableString;
  relatedEntityId: NullableString;
  sentAt: NullableString;
  readAt: NullableString;
  createdAt: string;
}

// -- Audit log --------------------------------------------------------------
type RawAuditLogDto = Json200<'/audit-log', 'get'>[number];
export type AuditLogDto = Omit<
  RawAuditLogDto,
  'actorUserId' | 'actorSystemJob' | 'actorIp' | 'prevHash' | 'changedFields'
> & {
  actorUserId: NullableString;
  actorSystemJob: NullableString;
  actorIp: NullableString;
  prevHash: NullableString;
  changedFields: unknown;
};
export type AuditLogActorDto = NonNullable<AuditLogDto['actorUser']>;

// AuditExportController.verify's @ApiOkResponse only carries a plain-string
// `description` (not a `type:`), so the generator has no structured schema
// to emit here — hand-typed to match AuditVerifyResponseDto's real shape
// (backend/api/src/modules/identity/audit-export.controller.ts).
export interface AuditVerifyMismatchDto {
  id: string;
  entityType: string;
  entityId: string;
  storedHash: string;
  recomputedHash: string;
}
export interface AuditVerifyCheckpointDto {
  id: string;
  checkpointAt: string;
  anchorHashValid: boolean;
}
export interface AuditVerifyResponseDto {
  rangeStart: string | null;
  rangeEnd: string;
  rowsChecked: number;
  mismatches: AuditVerifyMismatchDto[];
  mismatchCount: number;
  checkpoints: AuditVerifyCheckpointDto[];
  verified: boolean;
}

// -- SCIM tokens --------------------------------------------------------------
type RawScimTokenDto = Json200<'/identity/scim-tokens', 'get'>[number];
export type ScimTokenDto = Omit<RawScimTokenDto, 'lastUsedAt'> & { lastUsedAt: NullableString };
export type CreateScimTokenBody = JsonBody<'/identity/scim-tokens', 'post'>;
/** Only present on the create response — the raw token is never retrievable again afterward, see scim-token-create-dialog.tsx. */
type RawScimTokenCreatedDto = Json200<'/identity/scim-tokens', 'post'>;
export type ScimTokenCreatedDto = Omit<RawScimTokenCreatedDto, 'lastUsedAt'> & { lastUsedAt: NullableString };

// -- Webhook subscriptions -----------------------------------------------------
type RawWebhookSubscriptionDto = Json200<'/integrations/webhook-subscriptions', 'get'>[number];
export type WebhookSubscriptionDto = RawWebhookSubscriptionDto;
export type CreateWebhookSubscriptionBody = JsonBody<'/integrations/webhook-subscriptions', 'post'>;
export type UpdateWebhookSubscriptionBody = JsonBody<'/integrations/webhook-subscriptions/{id}', 'patch'>;
/** Only present on the create response — the raw signing secret is never retrievable again afterward, see webhook-form-dialog.tsx. */
export type WebhookSubscriptionCreatedDto = Json200<'/integrations/webhook-subscriptions', 'post'>;

type RawWebhookDeliveryDto = Json200<'/integrations/webhook-subscriptions/{id}/deliveries', 'get'>[number];
export type WebhookDeliveryDto = Omit<
  RawWebhookDeliveryDto,
  'lastAttemptAt' | 'nextAttemptAt' | 'responseStatus' | 'responseBodySnippet'
> & {
  lastAttemptAt: NullableString;
  nextAttemptAt: NullableString;
  responseStatus: NullableNumber;
  responseBodySnippet: NullableString;
};

// -- Automation rules (Triggers + Automations) -----------------------------
// Split by AutomationTriggerType per Zendesk's "Triggers" (ENTITY_EVENT,
// real-time, fires on a record event) vs "Automations" (SCHEDULE, time-based
// scan) admin concepts — see backend/api/src/modules/crm/
// automation-rules.controller.ts and app/(admin)/admin/triggers|automations.
// Fetched via the CRM domain's own BFF proxy (app/api/crm/automation-rules/**,
// not app/api/admin/**) since the backend controller is mounted at
// crm/automation-rules alongside accounts/leads/opportunities, not under
// identity/**; the generated-ApiPaths pattern below still applies regardless
// of which frontend BFF route reaches it, since ApiPaths mirrors backend/api
// paths directly.
export type AutomationTriggerType = 'SCHEDULE' | 'ENTITY_EVENT';

type RawAutomationRuleDto = Json200<'/crm/automation-rules', 'get'>[number];
// `conditions`/`actions` are intentionally left as `unknown` past the
// generated `{ [key: string]: unknown }` object shape — actions is really a
// JSON *array* of `{ actionType: string, params: Record<string, unknown> }`
// per CreateAutomationRuleDto's own doc comment, which the generator can't
// express — same "generated shape is too narrow" rationale as
// SetOrgSettingBody above.
// `steps` is the multi-step + approval-gate workflow engine field added
// this session (see backend/api/src/modules/crm/dto/automation-rule.dto.ts).
// The generated schema now DOES include it (regenerated since), but still
// too narrow the same way conditions/actions are (a `{ [key: string]:
// unknown }[] & unknown[]` intersection from the DTO's `additionalProperties:
// true` array shape) — `steps` stays in the Omit list below so the override
// replaces it instead of intersecting with it (an intersection would force
// every caller to satisfy both the raw AND the override shape at once,
// which an empty `[]` or a plain `unknown[]` literal can't).
export type AutomationRuleDto = Omit<RawAutomationRuleDto, 'conditions' | 'actions' | 'steps'> & {
  conditions: unknown;
  actions: unknown[];
  steps?: unknown[] | null;
};

/**
 * GET /crm/automation-rules/:id/execution-log — hand-written rather than
 * derived from ApiPaths, same reasoning as AutomationRuleDto above: several
 * bare-nullable fields (ruleId/entityId) would otherwise collapse to
 * `{} | null` through the generator. One row per firing of the rule's flat
 * `actions` list (see AutomationExecutionLog's schema comment) — a rule
 * that's always used `steps` (branching) will just return `[]` here.
 */
export interface AutomationExecutionLogDto {
  id: string;
  ruleId: string | null;
  ruleName: string;
  entityType: string;
  entityId: string | null;
  triggerSource: string;
  status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED';
  actionResults: { actionType: string; ok: boolean; error?: string }[];
  createdAt: string;
}

type RawCreateAutomationRuleBody = JsonBody<'/crm/automation-rules', 'post'>;
// KNOWN GENERATOR GAP: `isActive` carries `@IsOptional() isActive?: boolean`
// on the backend DTO (CreateAutomationRuleDto) but the generator still
// emits it as required — patched optional here like the other gaps noted
// at the top of this file.
export type CreateAutomationRuleBody = Omit<RawCreateAutomationRuleBody, 'conditions' | 'actions' | 'steps' | 'isActive'> & {
  conditions: unknown;
  actions: unknown[];
  steps?: unknown[];
  isActive?: boolean;
};

type RawUpdateAutomationRuleBody = JsonBody<'/crm/automation-rules/{id}', 'patch'>;
export type UpdateAutomationRuleBody = Omit<RawUpdateAutomationRuleBody, 'conditions' | 'actions' | 'steps' | 'isActive'> & {
  conditions?: unknown;
  actions?: unknown[];
  steps?: unknown[];
  isActive?: boolean;
};

// -- Force logout ---------------------------------------------------------------
export type ForceLogoutResponseDto = Json200<'/identity/users/{id}/force-logout', 'post'>;
