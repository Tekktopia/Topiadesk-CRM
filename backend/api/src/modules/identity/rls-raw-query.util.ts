import { getPrismaClient, getRlsContext, type Prisma } from '@topiadesk/db';

/**
 * getPrismaClient()'s Proxy only auto-applies the RLS `set_config` step to
 * Prisma MODEL delegate calls — $queryRaw/$executeRaw are in its
 * PASSTHROUGH_KEYS allowlist and reach the underlying connection with NO
 * session vars set (see packages/db/src/client.ts's header comment).
 * audit-export.controller.ts's verify() needs a window function
 * (LAG() OVER (PARTITION BY chain_lane ORDER BY id)) to correctly
 * recompute the hash chain — no Prisma model-delegate API for that — so it
 * has to go through here. Same fix, same reasoning, as backend/worker/src/
 * rls-raw-query.util.ts and backend/api/src/modules/ai-gateway/
 * rls-raw-query.util.ts; duplicated per-module rather than shared, matching
 * this codebase's own existing precedent (worker already has its own copy
 * rather than a shared package).
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
