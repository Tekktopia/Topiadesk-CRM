import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type PermissionScope } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUserResponseDto, ResolvedPermissionDto } from './dto/current-user-response.dto';
import { UpdateMyPresenceDto } from './dto/update-my-presence.dto';

/**
 * Resource/action pairs the app/(cases)/** Case Config admin pages
 * (sla-policies/macros/assignment-rules/business-hours/agent-skills/
 * case-categories/loss-cause-categories) need write-scope for, to
 * button-gate New/Edit/Delete client-side. NOT one resource per page —
 * see each case-management/*.controller.ts's @RequirePermission
 * decorators, the actual source of truth this list mirrors:
 *   - sla_config: sla-policies, assignment-rules, business-hours, agent-skills
 *   - macro: macros
 *   - case: case-categories (case-categories.controller.ts reuses 'case',
 *     no dedicated 'case_category' resource is seeded)
 *   - claim: loss-cause-categories (same story, reuses 'claim')
 * Kept as a small fixed list (not every Permission row) — this is purely a
 * UX-gating signal for one part of the frontend, not a general-purpose
 * permissions API. The backend's @RequirePermission guard on each endpoint
 * remains the real enforcement regardless of what this reports.
 */
const CASE_CONFIG_WRITE_RESOURCES = ['sla_config', 'macro', 'case', 'claim'] as const;

const SCOPE_RANK: Record<PermissionScope, number> = { OWN: 1, DEPARTMENT: 2, BRANCH: 3, ALL: 4 };

/**
 * Resolves the caller's highest granted scope per CASE_CONFIG_WRITE_RESOURCES
 * entry — same ADMIN-is-always-'ALL' short-circuit and the same
 * user_roles -> role_permissions -> permissions join PermissionGuard already
 * runs (common/auth/permission.guard.ts), and the same ranking
 * app_max_scope() uses (packages/db/prisma/rls/002_policies.sql) — done here
 * via Prisma rather than a raw SQL call into that Postgres function, since
 * this only needs a fixed, small resource list and Prisma is already the
 * established pattern for this exact join (see PermissionGuard).
 */
async function resolveCaseConfigPermissions(user: AuthenticatedUser): Promise<ResolvedPermissionDto[]> {
  if (user.roles.includes('ADMIN')) {
    return CASE_CONFIG_WRITE_RESOURCES.map((resource) => ({ resource, action: 'write', scope: 'ALL' as PermissionScope }));
  }

  const grants = await getPrismaClient().rolePermission.findMany({
    where: {
      role: { users: { some: { userId: user.id } } },
      permission: { resource: { in: [...CASE_CONFIG_WRITE_RESOURCES] }, action: 'write' },
    },
    select: { permission: { select: { resource: true, scope: true } } },
  });

  const maxScopeByResource = new Map<string, PermissionScope>();
  for (const grant of grants) {
    const { resource, scope } = grant.permission;
    const current = maxScopeByResource.get(resource);
    if (!current || SCOPE_RANK[scope] > SCOPE_RANK[current]) {
      maxScopeByResource.set(resource, scope);
    }
  }

  return Array.from(maxScopeByResource.entries()).map(([resource, scope]) => ({ resource, action: 'write' as const, scope }));
}

/**
 * Foundation stub — proves the auth/RLS pipeline end-to-end (JWT verify ->
 * local user resolution -> RLS context bind). Batch 1 Agent A owns
 * backend/api/src/modules/identity/: User/Role/Permission/Department/Branch/
 * TeamMember/OrgSetting/IpWhitelistEntry CRUD, Keycloak sync webhook.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity')
export class IdentityController {
  @Get('me')
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserResponseDto> {
    return { ...user, permissions: await resolveCaseConfigPermissions(user) };
  }

  /**
   * Self-service only — no @RequirePermission, deliberately: any
   * authenticated user may set their own presence (Online/Away/Offline),
   * the same way any Zendesk/Freshdesk agent can toggle their own status
   * without needing a broader user-management grant. Scoped to `@CurrentUser()`'s
   * own id, never a body-supplied id, so this can never touch another
   * user's row.
   */
  @Patch('me/presence')
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async updateMyPresence(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyPresenceDto): Promise<CurrentUserResponseDto> {
    const updated = await getPrismaClient().user.update({
      where: { id: user.id },
      data: { presenceStatus: dto.presenceStatus, presenceUpdatedAt: new Date() },
    });
    return { ...user, presenceStatus: updated.presenceStatus, permissions: await resolveCaseConfigPermissions(user) };
  }
}
