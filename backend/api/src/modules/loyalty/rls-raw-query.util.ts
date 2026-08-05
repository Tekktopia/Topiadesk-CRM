import { getPrismaClient, getRlsContext, type Prisma } from '@topiadesk/db';

/**
 * getPrismaClient()'s Proxy only auto-applies the RLS `set_config` step to
 * Prisma MODEL delegate calls — $queryRaw/$executeRaw/$transaction are in
 * its PASSTHROUGH_KEYS allowlist and reach the underlying connection with
 * NO session vars set (see packages/db/src/client.ts's header comment).
 * loyalty-ledger.util.ts needs `app_max_scope()` (a plain SQL function, no
 * Prisma model-delegate equivalent) and a row-locking `SELECT ... FOR
 * UPDATE` (also no model-delegate equivalent) — so it has to go through
 * here. Same fix, same reasoning, as backend/api/src/modules/identity/
 * rls-raw-query.util.ts and its siblings; duplicated per-module rather than
 * shared, matching this codebase's own existing precedent.
 */
export async function queryRawWithRlsContext<T = unknown>(sql: Prisma.Sql): Promise<T[]> {
  const ctx = getRlsContext();
  if (!ctx) throw new Error('queryRawWithRlsContext called with no RLS context bound');
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.current_user_id', ${ctx.userId}, true),
      set_config('app.current_role', ${ctx.role}, true),
      set_config('app.current_dept_id', ${ctx.departmentId ?? ''}, true),
      set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true),
      set_config('app.current_client_ip', ${ctx.clientIp ?? ''}, true)`;
    return tx.$queryRaw<T[]>(sql);
  });
}
