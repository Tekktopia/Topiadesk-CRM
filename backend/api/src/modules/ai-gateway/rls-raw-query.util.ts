import { getPrismaClient, getRlsContext, type Prisma } from '@topiadesk/db';

/**
 * getPrismaClient()'s Proxy only auto-applies the RLS `set_config` step to
 * Prisma MODEL delegate calls (findMany/create/...) — $queryRaw/$executeRaw
 * are in its PASSTHROUGH_KEYS allowlist and reach the underlying connection
 * with NO session vars set (see packages/db/src/client.ts's header comment;
 * backend/worker/src/rls-raw-query.util.ts is the worker-side sibling of
 * this same fix). Needed here specifically because
 * SemanticEmbedding.embedding is a pgvector `Unsupported("vector(1024)")`
 * type, which Prisma Client excludes entirely from its generated CRUD API
 * (confirmed empirically: `embedding` is absent from
 * Prisma.SemanticEmbeddingScalarFieldEnum, so `prisma.semanticEmbedding.
 * create()` has no `embedding` field to assign at all) — every read AND
 * write touching that column has to go through raw SQL, unlike every other
 * table in this codebase.
 *
 * Callers control WHICH RLS identity these run under the normal way — via
 * whatever `runWithRlsContext(...)` scope they're invoked inside, same as
 * every Prisma model-delegate call. ai-gateway.service.ts's search() runs
 * these under the caller's own ambient session (real per-row visibility);
 * its index() write deliberately wraps the call in a narrow
 * `runWithRlsContext(SYSTEM_JOB_CONTEXT, ...)` — see that method's comment
 * for why.
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

export async function executeRawWithRlsContext(sql: Prisma.Sql): Promise<number> {
  const ctx = getRlsContext();
  if (!ctx) throw new Error('executeRawWithRlsContext called with no RLS context bound');
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.current_user_id', ${ctx.userId}, true),
      set_config('app.current_role', ${ctx.role}, true),
      set_config('app.current_dept_id', ${ctx.departmentId ?? ''}, true),
      set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true),
      set_config('app.current_client_ip', ${ctx.clientIp ?? ''}, true)`;
    return tx.$executeRaw(sql);
  });
}
