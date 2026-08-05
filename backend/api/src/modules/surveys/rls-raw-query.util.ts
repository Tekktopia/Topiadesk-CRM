import { ForbiddenException } from '@nestjs/common';
import { getPrismaClient, getRlsContext } from '@topiadesk/db';

/**
 * Duplicated from policy/rls-raw-query.util.ts rather than imported
 * cross-module (each Phase 2 module is scoped to its own directory —
 * see this module's other files' header comments on why). Identical
 * reasoning applies here: `agent_survey_summary_scoped`
 * (prisma/rls/004_reporting_views.sql) is a plain view over a
 * materialized view with no Prisma model, so the CSAT/NPS report
 * endpoints have no delegate to route through and must issue raw SQL.
 * `getPrismaClient().$queryRaw` is in the RLS Proxy's PASSTHROUGH_KEYS
 * allowlist and reaches the connection with no session vars set — this
 * replicates client.ts's own interactive-transaction + set_config
 * pattern for that one case.
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
