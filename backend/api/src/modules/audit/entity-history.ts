import { getPrismaClient, Prisma, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import type { AuditLogResponseDto } from './dto/audit-log-response.dto';

/**
 * Shared by AccountsController/PolicyController/CasesController/
 * ClaimsController's own `:id/history` endpoints — same response shape as
 * AuditLogController.list() (AuditLogResponseDto), so `@topiadesk/ui`'s
 * <RecordHistory> can point at either without any frontend change, just a
 * different `fetchUrl`. `audit_log` itself is RLS-gated to
 * COMPLIANCE_OFFICER/ADMIN (audit_log_rw, prisma/rls/002_policies.sql),
 * correct for the org-wide compliance trail (GET /audit-log) but wrong for
 * "can I see THIS record's own change history" when I can already read the
 * record itself — same class of gap fixed for named workflow approvers
 * (see ApprovalDelegation's own comment). Callers MUST verify the caller
 * can read the target row (under their own real RLS context) before
 * calling this — same ordering OpportunitiesController.stageHistory()
 * already established, load-bearing for the same reason: it's what stops
 * this from becoming "read any record's history by guessing its id."
 */
const AUDIT_ACTOR_INCLUDE = { actorUser: { select: { id: true, fullName: true, email: true } } } satisfies Prisma.AuditLogInclude;

export async function loadEntityHistory(entityType: string, entityId: string, take = 50): Promise<AuditLogResponseDto[]> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const rows = await getPrismaClient().auditLog.findMany({
      where: { entityType, entityId },
      include: AUDIT_ACTOR_INCLUDE,
      orderBy: { id: 'desc' },
      take,
    });
    return rows.map((row) => ({ ...row, id: row.id.toString() }));
  });
}
