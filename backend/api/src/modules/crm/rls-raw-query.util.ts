import { ForbiddenException } from '@nestjs/common';
import { getPrismaClient, getRlsContext } from '@topiadesk/db';

/**
 * `getPrismaClient()`'s Proxy only auto-applies the RLS `set_config` step to
 * Prisma MODEL delegate calls (account.findMany, etc.) — $queryRaw/
 * $executeRaw/$transaction are in its PASSTHROUGH_KEYS allowlist and reach
 * the underlying connection with NO session vars set (see
 * packages/db/src/client.ts's header comment). Calling
 * `getPrismaClient().$queryRaw` bare here would run with app.current_user_id
 * unset, and accounts_rw/contacts_rw/leads_rw would evaluate to false for
 * every row — a silent "no duplicates found" instead of an error.
 *
 * Duplicate detection needs raw SQL because it uses pg_trgm's `similarity()`
 * and Postgres's `regexp_replace()` for phone normalization, neither of
 * which Prisma's typed query API exposes — this replicates client.ts's own
 * interactive-transaction + set_config pattern for that case, same as
 * modules/policy/rls-raw-query.util.ts and modules/surveys/rls-raw-query.util.ts.
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
