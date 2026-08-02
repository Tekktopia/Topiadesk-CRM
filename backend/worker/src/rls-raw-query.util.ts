import { getPrismaClient, getRlsContext } from '@topiadesk/db';

/**
 * `getPrismaClient()`'s Proxy only auto-applies the RLS `set_config` step to
 * Prisma MODEL delegate calls (renewalSchedule.findMany, etc.) —
 * $executeRaw/$queryRaw/$transaction are in its PASSTHROUGH_KEYS allowlist
 * and reach the underlying connection with NO session vars set (see
 * packages/db/src/client.ts's header comment). That matters here:
 * `refresh_premium_aging_summary()` is SECURITY INVOKER (the default) and
 * its REFRESH re-runs the view's query against `premiums`, which IS
 * RLS-protected (`premiums_rw` — prisma/rls/002_policies.sql). Without
 * app.current_role bound to SYSTEM_JOB first, the refresh would silently
 * populate the materialized view with ZERO rows instead of erroring
 * (app_can_access_owner defaults to false with no session context). This
 * replicates client.ts's own interactive-transaction + set_config pattern
 * for the one raw-SQL call this job needs.
 */
export async function executeRawWithRlsContext(sql: string): Promise<void> {
  const ctx = getRlsContext();
  if (!ctx) throw new Error('executeRawWithRlsContext called with no RLS context bound');
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.current_user_id', ${ctx.userId}, true),
      set_config('app.current_role', ${ctx.role}, true),
      set_config('app.current_dept_id', ${ctx.departmentId ?? ''}, true),
      set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true),
      set_config('app.current_client_ip', ${ctx.clientIp ?? ''}, true)`;
    await tx.$executeRawUnsafe(sql);
  });
}
