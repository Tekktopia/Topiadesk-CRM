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
export type UserDto = Omit<RawUserDto, 'phone' | 'departmentId' | 'branchId' | 'lastSyncedAt'> & {
  phone: NullableString;
  departmentId: NullableString;
  branchId: NullableString;
  lastSyncedAt: NullableString;
};

type RawUpdateUserBody = JsonBody<'/identity/users/{id}', 'patch'>;
export type UpdateUserBody = Omit<RawUpdateUserBody, 'departmentId' | 'branchId'> & {
  departmentId?: NullableString;
  branchId?: NullableString;
};

export type AssignRoleBody = JsonBody<'/identity/users/{id}/roles', 'post'>;

// -- Roles & permissions --------------------------------------------------
type RawRoleDto = Json200<'/identity/roles', 'get'>[number];
export type RoleDto = Omit<RawRoleDto, 'description'> & { description: NullableString };
export type PermissionSummaryDto = RoleDto['permissions'][number];
export type CreateRoleBody = JsonBody<'/identity/roles', 'post'>;
export type UpdateRoleBody = JsonBody<'/identity/roles/{id}', 'patch'>;
export type GrantPermissionBody = JsonBody<'/identity/roles/{id}/permissions', 'post'>;
export type PermissionDto = Json200<'/identity/permissions', 'get'>[number];

// -- Departments / branches ------------------------------------------------
type RawDepartmentDto = Json200<'/identity/departments', 'get'>[number];
export type DepartmentDto = Omit<RawDepartmentDto, 'parentDepartmentId'> & { parentDepartmentId: NullableString };
type RawCreateDepartmentBody = JsonBody<'/identity/departments', 'post'>;
export type CreateDepartmentBody = Omit<RawCreateDepartmentBody, 'parentDepartmentId'> & {
  parentDepartmentId?: NullableString;
};
type RawUpdateDepartmentBody = JsonBody<'/identity/departments/{id}', 'patch'>;
export type UpdateDepartmentBody = Omit<RawUpdateDepartmentBody, 'parentDepartmentId'> & {
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
type RawConnectorDto = Json200<'/integrations/connectors', 'get'>[number];
export type ConnectorDto = Omit<RawConnectorDto, 'lastSuccessfulSyncAt'> & { lastSuccessfulSyncAt: NullableString };

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
