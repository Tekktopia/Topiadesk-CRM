import { getRlsContext, type PrismaClient } from '@topiadesk/db';

/**
 * `$queryRaw` is one of client.ts's PASSTHROUGH_KEYS — a bare call through
 * getPrismaClient() reaches Postgres with NO `app.current_*` session vars
 * set, so an RLS-protected view (premium_aging_summary_scoped, which joins
 * back to policies/accounts and inherits their RLS via app_can_access_owner)
 * would silently return zero rows for an interactive caller instead of
 * their actually-visible slice. This replicates client.ts's own
 * wrapModelDelegate set_config step for the one report (premium-aging-by-
 * branch) that needs a raw parameterized query instead of the typed API —
 * same interactive-transaction shape as backend/worker's
 * rls-raw-query.util.ts (executeRawWithRlsContext), generalized to return
 * query results instead of just executing a statement.
 *
 * Always parameterized via tagged templates by the caller — this function
 * never accepts a pre-built SQL string, so there is no string-concatenation
 * injection surface here regardless of what `query` does internally.
 */
export async function queryRawWithRlsContext<T>(prisma: PrismaClient, query: (tx: PrismaClient) => Promise<T>): Promise<T> {
  const ctx = getRlsContext();
  if (!ctx) throw new Error('queryRawWithRlsContext called outside a bound RLS context');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.current_user_id', ${ctx.userId}, true),
      set_config('app.current_role', ${ctx.role}, true),
      set_config('app.current_dept_id', ${ctx.departmentId ?? ''}, true),
      set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true),
      set_config('app.current_client_ip', ${ctx.clientIp ?? ''}, true)`;
    return query(tx as unknown as PrismaClient);
  });
}
