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
}

const rlsStorage = new AsyncLocalStorage<RlsContext>();

export function runWithRlsContext<T>(ctx: RlsContext, fn: () => T): T {
  return rlsStorage.run(ctx, fn);
}

export function getRlsContext(): RlsContext | undefined {
  return rlsStorage.getStore();
}

/** Principal used by BullMQ jobs and other background code — see prisma/rls policy branches for SYSTEM_JOB. */
export const SYSTEM_JOB_CONTEXT: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'SYSTEM_JOB',
  departmentId: null,
  branchId: null,
  clientIp: null,
};
