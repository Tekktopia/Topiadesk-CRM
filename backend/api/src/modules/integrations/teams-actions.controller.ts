import { BadRequestException, Controller, ForbiddenException, GoneException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type RlsContext } from '@topiadesk/db';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { hashApiKey } from '../identity/api-key.util';
import { decideAutomationRun } from '../case-management/automation-run-decision';
import type { DecideAutomationRunDto } from '../case-management/dto/automation-run-state.dto';

const DECISIONS = ['APPROVED', 'REJECTED'] as const;

/**
 * Two-way Microsoft Teams — the inbound half of the Approve/Reject
 * MessageCard buttons notifyApproversViaTeams() posts (see
 * backend/worker/src/automation/run-engine.ts). Excluded from
 * RlsContextMiddleware (app.module.ts) — Teams' `HttpPOST` action presents
 * no TopiaDesk-issued JWT, only the single-use token embedded in the
 * button's own target URL, so this controller does its own two-phase
 * bootstrap: look up the token + resolve the acting user's LIVE roles
 * under a forced SYSTEM_JOB_CONTEXT (same reasoning as
 * RlsContextMiddleware's own bootstrap lookup — no real RlsContext can be
 * bound before it's DERIVED), then re-run the actual decision under a real
 * per-user RlsContext (never SYSTEM_JOB_CONTEXT for the decision itself)
 * so authorization/attribution match the in-app "Decide" button exactly —
 * `Approval.approvedById` ends up as the real clicking user, and RLS
 * authorizes against their real scope, not an elevated bypass.
 *
 * Reuses api-key.util.ts's hashApiKey() — both are the same plain
 * SHA-256-hex-digest-as-lookup-key shape (see that file's own comment for
 * why that's the right primitive for a high-entropy random token); no
 * behavioral coupling between ApiKey and TeamsActionToken beyond sharing
 * this one hash function.
 */
@ApiTags('integrations')
@Controller('integrations/teams-actions')
export class TeamsActionsController {
  @Post(':token')
  async handle(@Param('token') token: string, @Query('decision') decisionParam: string | undefined): Promise<{ status: string; message: string }> {
    if (!decisionParam || !DECISIONS.includes(decisionParam as (typeof DECISIONS)[number])) {
      throw new BadRequestException('Missing or invalid decision query param');
    }
    const decision = decisionParam as (typeof DECISIONS)[number];

    const tokenHash = hashApiKey(token);
    const prisma = getPrismaClient();

    const tokenRow = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () => prisma.teamsActionToken.findUnique({ where: { tokenHash } }));
    if (!tokenRow) throw new ForbiddenException('Invalid or unknown action link');
    if (tokenRow.usedAt) throw new GoneException('This link has already been used');
    if (tokenRow.expiresAt < new Date()) throw new GoneException('This link has expired');

    const tenantSchema = tokenRow.tenantSchema;

    // Atomic claim — a concurrent duplicate click (both buttons, or a
    // retried POST) loses the race here rather than double-applying a
    // decision.
    const claimed = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      prisma.teamsActionToken.updateMany({ where: { id: tokenRow.id, usedAt: null }, data: { usedAt: new Date() } }),
    );
    if (claimed.count === 0) throw new GoneException('This link has already been used');

    const localUser = await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, () =>
      prisma.user.findUnique({ where: { id: tokenRow.actingUserId }, include: { roles: { include: { role: true } } } }),
    );
    if (!localUser || localUser.status !== 'ACTIVE') {
      throw new ForbiddenException('No active account for this action');
    }

    const roleNames = localUser.roles.map((r: { role: { name: string } }) => r.role.name);
    const roleIds = localUser.roles.map((r: { role: { id: string } }) => r.role.id);
    const authenticatedUser: AuthenticatedUser = {
      id: localUser.id,
      email: localUser.email,
      fullName: localUser.fullName,
      presenceStatus: localUser.presenceStatus,
      roles: roleNames,
      roleIds,
      departmentId: localUser.departmentId,
      branchId: localUser.branchId,
    };

    const ctx: RlsContext = {
      userId: localUser.id,
      role: roleNames.includes('ADMIN') ? 'ADMIN' : 'USER',
      departmentId: localUser.departmentId,
      branchId: localUser.branchId,
      clientIp: null,
      tenantSchema,
      keycloakRealm: null,
    };

    const dto: DecideAutomationRunDto = { decision, note: decision === 'REJECTED' ? 'Decided via Microsoft Teams' : undefined };
    await runWithRlsContext(ctx, () => decideAutomationRun(tokenRow.runStateId, dto, authenticatedUser));

    return { status: 'ok', message: decision === 'APPROVED' ? `Approved by ${localUser.fullName}.` : `Rejected by ${localUser.fullName}.` };
  }
}
