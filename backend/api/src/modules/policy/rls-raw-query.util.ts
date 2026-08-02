import { ForbiddenException } from '@nestjs/common';
import { getPrismaClient, getRlsContext } from '@topiadesk/db';

/**
 * `getPrismaClient()`'s Proxy only auto-applies the RLS `set_config` step to
 * Prisma MODEL delegate calls (policy.findMany, etc.) — $queryRaw/
 * $executeRaw/$transaction are in its PASSTHROUGH_KEYS allowlist and reach
 * the underlying connection with NO session vars set (see
 * packages/db/src/client.ts's header comment; health.controller.ts's
 * `$queryRaw\`SELECT 1\`` is the one place that's already safe to call bare,
 * because that query never touches an RLS-protected table).
 *
 * `premium_aging_summary_scoped` (prisma/rls/004_reporting_views.sql) has
 * no Prisma model — it's a plain view over a materialized view — so the
 * premium-aging endpoint has no delegate to route through and must issue
 * raw SQL. Calling `getPrismaClient().$queryRaw` bare here would run with
 * app.current_user_id unset, and the view's `app_can_access_owner(...)`
 * check would evaluate to false for every row — a silent "zero results"
 * instead of an error, which reads as "no outstanding premiums" rather
 * than the RLS-context bug it actually is. This replicates client.ts's own
 * interactive-transaction + set_config pattern for that one case.
 */
export async function queryRawWithRlsContext<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
  const ctx = getRlsContext();
  if (!ctx) throw new ForbiddenException('No RLS context bound for raw query');
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.current_user_id', ${ctx.userId}, true),
      set_config('app.current_role', ${ctx.role}, true),
      set_config('app.current_dept_id', ${ctx.departmentId ?? ''}, true),
      set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true),
      set_config('app.current_client_ip', ${ctx.clientIp ?? ''}, true)`;
    return tx.$queryRaw<T>(strings, ...values);
  });
}
