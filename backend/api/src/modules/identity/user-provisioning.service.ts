import { Injectable } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';

export interface UpsertLocalUserParams {
  keycloakSubjectId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** false maps to the same local deactivation as an explicit USER_DISABLED/deactivate call. */
  enabled?: boolean;
  departmentCode?: string;
  branchCode?: string;
}

export interface ProvisioningResult {
  action: 'created' | 'updated' | 'deactivated' | 'skipped';
  userId: string | null;
}

/**
 * Extracted from keycloak-webhook.controller.ts's `process()` method, which
 * used to inline this create/update/deactivate-by-keycloakSubjectId logic
 * directly. Now shared between:
 *  - KeycloakWebhookController — Keycloak notifies US of a user-lifecycle
 *    change it already made; this only ever needs to reflect that into the
 *    local `users` table, one direction, no Keycloak API call.
 *  - ScimController — an external IdP/admin tool calls US to provision a
 *    user; TopiaDesk isn't the identity source of truth so that also has to
 *    propagate OUT to Keycloak (via KeycloakAdminService, since Keycloak has
 *    no native SCIM support) BEFORE landing here for the local-row half of
 *    the write. This service itself stays Keycloak-API-agnostic — it only
 *    ever touches Postgres — callers own sequencing the Keycloak call.
 *
 * Callers are responsible for the RLS context this runs under (both current
 * callers wrap it in `runWithRlsContext(SYSTEM_JOB_CONTEXT, ...)`, since
 * neither the Keycloak webhook nor SCIM has a normal user JWT session to
 * bind — see keycloak-webhook.controller.ts's and scim.controller.ts's own
 * header comments for why).
 */
@Injectable()
export class UserProvisioningService {
  async upsertLocalUser(params: UpsertLocalUserParams): Promise<ProvisioningResult> {
    const prisma = getPrismaClient();
    const fullName = [params.firstName, params.lastName].filter(Boolean).join(' ').trim() || params.email;
    const status = params.enabled === false ? 'DEACTIVATED' : 'ACTIVE';

    let departmentId: string | undefined;
    let branchId: string | undefined;
    if (params.departmentCode) {
      const dept = await prisma.department.findUnique({ where: { code: params.departmentCode } });
      departmentId = dept?.id;
    }
    if (params.branchCode) {
      const branch = await prisma.branch.findUnique({ where: { code: params.branchCode } });
      branchId = branch?.id;
    }

    const existing = await prisma.user.findUnique({ where: { keycloakSubjectId: params.keycloakSubjectId } });

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: params.email,
          fullName,
          status,
          ...(departmentId !== undefined && { departmentId }),
          ...(branchId !== undefined && { branchId }),
          lastSyncedAt: new Date(),
        },
      });
      return { action: 'updated', userId: updated.id };
    }

    const created = await prisma.user.create({
      data: {
        keycloakSubjectId: params.keycloakSubjectId,
        email: params.email,
        fullName,
        status,
        departmentId,
        branchId,
        lastSyncedAt: new Date(),
      },
    });
    return { action: 'created', userId: created.id };
  }

  /**
   * Deactivate rather than delete: Users are referenced widely (Account
   * owners, Policy broker-of-record, ...) — a hard delete would either
   * cascade destructively or fail on FK constraints. DEACTIVATED is the
   * correct "this identity should no longer act" signal.
   */
  async deactivateByKeycloakSubjectId(keycloakSubjectId: string): Promise<ProvisioningResult> {
    const prisma = getPrismaClient();
    const existing = await prisma.user.findUnique({ where: { keycloakSubjectId } });
    if (!existing) return { action: 'skipped', userId: null };
    await prisma.user.update({ where: { id: existing.id }, data: { status: 'DEACTIVATED', lastSyncedAt: new Date() } });
    return { action: 'deactivated', userId: existing.id };
  }
}
