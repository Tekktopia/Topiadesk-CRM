import { Injectable } from '@nestjs/common';
import { getPlatformPrismaClient, type Prisma } from '@topiadesk/db-platform';

/**
 * Records every mutating /platform/* action — see PlatformAuditLog's own
 * schema doc comment for why this is a plain append-only table, not
 * hash-chained like the tenant schema's `audit_log`. Simpler than the
 * tenant-side AuditService: platform RLS has no separate stricter
 * SELECT-tier that would reject the caller reading back their own
 * just-inserted row (see that service's own header comment for the tenant
 * schema's version of that problem), so this writes directly under the
 * caller's own already-bound platform-admin context — no SYSTEM_JOB
 * switch needed.
 */
@Injectable()
export class PlatformAuditService {
  async recordEvent(params: { actorPlatformAdminId: string; action: string; entityType: string; entityId: string; detail?: Record<string, unknown> }): Promise<void> {
    await getPlatformPrismaClient().platformAuditLog.create({
      data: {
        actorPlatformAdminId: params.actorPlatformAdminId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        detail: params.detail as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
