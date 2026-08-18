import { Injectable } from '@nestjs/common';
import { getPrismaClient, getRlsContext, runWithRlsContext, SYSTEM_JOB_CONTEXT, type AuditAction, type Prisma } from '@topiadesk/db';

/**
 * For audit events with NO corresponding row mutation — LOGIN,
 * LOGIN_FAILED, EXPORT, VIEW_SENSITIVE, PERMISSION_CHANGE. Ordinary
 * CREATE/UPDATE/DELETE on tracked business tables are captured automatically
 * by the Postgres trigger (prisma/triggers/002_audit_chain_triggers.sql) —
 * do not duplicate those here.
 *
 * Writes under SYSTEM_JOB_CONTEXT, not the caller's own bound context —
 * found via live testing (identity-enterprise pass): `INSERT ... RETURNING`
 * (what Prisma's `.create()` always generates) also enforces the table's
 * SELECT policy on the newly-inserted row, not just the INSERT policy's
 * WITH CHECK. `audit_log_select` requires `audit_log:read` at ALL scope
 * (only ADMIN/COMPLIANCE_OFFICER hold it) or SYSTEM_JOB — so ANY OTHER
 * caller recording a real audit event (e.g. a broker's role assignment
 * triggering a PERMISSION_CHANGE entry) hit a genuine, previously-
 * undiscovered "new row violates row-level security policy for table
 * audit_log" 500 on every call, silently losing the audit trail entry too
 * (the preceding business-logic write, e.g. the actual UserRole grant,
 * already committed in its own transaction — this failure came after).
 * The real actor is still captured correctly: `ctx` is read from the
 * caller's own context BEFORE switching, and its values (not
 * SYSTEM_JOB_CONTEXT's empty ones) are what get written to the row.
 *
 * The bare SYSTEM_JOB_CONTEXT constant also carries `tenantSchema: null`
 * (see its own doc comment) — passing it unmodified here silently resets
 * the Prisma client's search_path to the DEFAULT_SCHEMA ('public') for
 * this call, regardless of which tenant schema the caller was actually
 * bound to. That only went unnoticed because the original seed tenant's
 * own schemaName IS 'public', so testing against it never exposed the
 * mismatch. Every other (properly schema-isolated) tenant hit a genuine
 * `actor_user_id` foreign-key violation on this insert instead — writing
 * a real tenant-local user id against `public.audit_log`, which only
 * knows about `public.users`. Preserving the caller's tenantSchema below
 * fixes this while still getting SYSTEM_JOB's elevated role for the
 * audit_log_select bypass described above.
 */
@Injectable()
export class AuditService {
  async recordEvent(params: {
    action: AuditAction;
    entityType: string;
    entityId: string;
    changedFields?: Record<string, unknown>;
  }): Promise<void> {
    const ctx = getRlsContext();
    const prisma = getPrismaClient();
    await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: ctx?.tenantSchema ?? null }, () =>
      prisma.auditLog.create({
        data: {
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          // `|| undefined`, not just `?.userId` — a caller itself already
          // running under SYSTEM_JOB_CONTEXT (userId: '', see that
          // constant's own doc comment) would otherwise send the literal
          // empty string as a UUID parameter, which Postgres rejects
          // outright ("invalid input syntax for type uuid") rather than
          // treating as unset the way raw SQL's NULLIF(..., '') does.
          actorUserId: ctx?.userId || undefined,
          actorIp: ctx?.clientIp ?? undefined,
          changedFields: params.changedFields as Prisma.InputJsonValue | undefined,
          // chainLane/prevHash/currentHash are computed by the audit_log
          // BEFORE INSERT trigger — these are structural placeholders only.
          chainLane: 0,
          currentHash: '',
        },
      }),
    );
  }
}
