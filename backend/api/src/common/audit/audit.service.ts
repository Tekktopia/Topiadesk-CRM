import { Injectable } from '@nestjs/common';
import { getPrismaClient, getRlsContext, type AuditAction, type Prisma } from '@topiadesk/db';

/**
 * For audit events with NO corresponding row mutation — LOGIN,
 * LOGIN_FAILED, EXPORT, VIEW_SENSITIVE, PERMISSION_CHANGE. Ordinary
 * CREATE/UPDATE/DELETE on tracked business tables are captured automatically
 * by the Postgres trigger (prisma/triggers/002_audit_chain_triggers.sql) —
 * do not duplicate those here.
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
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorUserId: ctx?.userId,
        actorIp: ctx?.clientIp ?? undefined,
        changedFields: params.changedFields as Prisma.InputJsonValue | undefined,
        // chainLane/prevHash/currentHash are computed by the audit_log
        // BEFORE INSERT trigger — these are structural placeholders only.
        chainLane: 0,
        currentHash: '',
      },
    });
  }
}
