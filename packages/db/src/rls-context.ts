import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Framework-agnostic RLS context, shared by backend/api and backend/worker.
 * Every code path that touches the Prisma client MUST run inside
 * `runWithRlsContext` — the extension in client.ts falls back to running
 * queries with NO session-scoped Postgres role predicates applied if no
 * context is bound, which for RLS-protected tables means zero rows (fails
 * closed, not open) rather than a silent full-table leak.
 */
export interface RlsContext {
  userId: string;
  /**
   * NOT a "primary role" — app_max_scope() in prisma/rls/002_policies.sql
   * resolves permissions by joining ALL of a user's assigned roles via
   * user_roles, correctly handling multi-role users. This field is only a
   * fast-path flag for two literal values the SQL checks directly: 'ADMIN'
   * (full access) and 'SYSTEM_JOB' (background workers). Any other value
   * (e.g. 'USER') falls through to the normal per-permission resolution.
   */
  role: string;
  departmentId: string | null;
  branchId: string | null;
  /** Populated from the request's client IP; stored on audit_log rows via app.current_client_ip. */
  clientIp: string | null;
  /**
   * The tenant's Postgres schema name AND Keycloak realm name — both are
   * guaranteed identical by construction (backend/api's tenants.controller.ts
   * writes the same `tenant_<slug>` string to Tenant.schemaName and
   * Tenant.keycloakRealm in one insert). `null` selects the original
   * pre-multi-tenant deployment (resolves to `'public'` in client.ts) —
   * each consumer applies its OWN correct default for `null`, since e.g.
   * client.ts's default ('public') and KeycloakAdminService's default
   * (env.KEYCLOAK_REALM) are NOT the same literal string.
   *
   * Every one of SYSTEM_JOB_CONTEXT's ~50 existing bare consumers keeps
   * working unmodified (scoped to 'public', today's behavior) since this
   * constant's own tenantSchema is null — only code that needs a
   * *different* tenant's SYSTEM_JOB privileges spreads-and-overrides:
   * `{ ...SYSTEM_JOB_CONTEXT, tenantSchema: schema }` (see
   * RlsContextMiddleware's bootstrap lookup for the one existing example).
   */
  tenantSchema: string | null;
}

const rlsStorage = new AsyncLocalStorage<RlsContext>();

export function runWithRlsContext<T>(ctx: RlsContext, fn: () => T): T {
  return rlsStorage.run(ctx, fn);
}

export function getRlsContext(): RlsContext | undefined {
  return rlsStorage.getStore();
}

/**
 * Principal used by BullMQ jobs and other background code — see
 * prisma/rls policy branches for SYSTEM_JOB (app_max_scope() hardcodes
 * 'ALL' for this role regardless of userId, so RLS scoping is entirely
 * role-driven here — userId is NOT used for any scope decision).
 *
 * userId is deliberately '' (empty), not a placeholder UUID like
 * '00000000-...': the audit-chain trigger (prisma/triggers/
 * 001_audit_chain_function.sql) falls back to
 * `NEW.actor_user_id := app_current_user_id()` whenever a row-change
 * trigger doesn't set it explicitly, and `audit_log.actor_user_id` has an
 * FK to `users(id)`. A placeholder UUID that isn't a real user row makes
 * every write to an audit-tracked table (e.g. renewal_schedules) under this
 * context fail with a foreign-key violation — caught empirically running
 * the renewal-alert scan against seeded data. `app_current_user_id()` is
 * `NULLIF(current_setting('app.current_user_id', true), '')::uuid`, so an
 * empty string resolves to SQL NULL, which the FK (nullable) accepts —
 * same "empty string -> unset" convention departmentId/branchId already
 * use below via the `?? ''` fallback in client.ts's set_config call.
 */
export const SYSTEM_JOB_CONTEXT: RlsContext = {
  userId: '',
  role: 'SYSTEM_JOB',
  departmentId: null,
  branchId: null,
  clientIp: null,
  tenantSchema: null,
};
