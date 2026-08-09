import { BadGatewayException, BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
// NOT a type-only import: KeycloakAdminService is constructor-injected below.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from '../identity/keycloak-admin.service';
import { CreateTenantAdminUserDto, ResetTenantUserPasswordResponseDto, TenantUserResponseDto } from './dto/tenant-user.dto';
import { enqueueCreateTenantAdmin } from './create-tenant-admin-queue';
import { PlatformAuditService } from './platform-audit.service';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import type { PlatformAdminContext } from './platform-context';

/** Same policy shape as generateTemporaryPassword() in
 * backend/worker/src/jobs/platform/keycloak-realm-provisioning.ts (12+
 * chars, upper/lower/digit/special) — duplicated rather than imported,
 * same api/worker deployable-boundary convention every other job/service
 * pair in this codebase follows. */
function generateTemporaryPassword(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `Tdk!${random}A1`;
}

/**
 * A tenant's own users, viewed and managed from the platform side — list,
 * create an additional admin, reset password, deactivate/reactivate.
 * Distinct from platform-admins.controller.ts (the platform's OWN operator
 * accounts). Every handler resolves the target Tenant first and overrides
 * RlsContext.tenantSchema (+ role: 'SYSTEM_JOB', bypassing the tenant
 * schema's own OWN/DEPARTMENT/BRANCH tiering — a platform admin's view
 * isn't scoped by a tenant's internal org structure) to reach into that
 * tenant's schema via the SAME getPrismaClient()/KeycloakAdminService this
 * codebase already uses for every tenant-facing request — its cache is
 * keyed by schema, so this is safe to call for an arbitrary tenant from
 * platform-context code with no client changes needed.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/tenants/:tenantId/users')
export class TenantUsersController {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly auditService: PlatformAuditService,
  ) {}

  private async requireTenant(tenantId: string) {
    const tenant = await getPlatformPrismaClient().tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    if (tenant.status !== 'ACTIVE') throw new BadRequestException(`Tenant ${tenantId} is not ACTIVE (status: ${tenant.status})`);
    return tenant;
  }

  /** `{...SYSTEM_JOB_CONTEXT, tenantSchema}` — the documented pattern
   * (see RlsContext's own doc comment in packages/db/src/rls-context.ts)
   * for reaching a specific tenant's schema with SYSTEM_JOB privileges.
   * Deliberately NOT `{...getRlsContext()!, tenantSchema, role:'SYSTEM_JOB'}`
   * — that would keep the calling platform admin's own `userId` (a
   * `platform.platform_admin_users` id), which doesn't exist in the
   * tenant schema's own `users` table and made every write 500 on a
   * foreign-key violation (`audit_log.actor_user_id_fkey`) the moment the
   * tenant schema's audit trigger tried to record it as the actor —
   * confirmed live. */
  private withTenantSchema<T>(tenantSchema: string, fn: () => Promise<T>): Promise<T> {
    return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, fn);
  }

  @Get()
  @ApiOkResponse({ type: [TenantUserResponseDto] })
  async list(@Param('tenantId') tenantId: string): Promise<TenantUserResponseDto[]> {
    const tenant = await this.requireTenant(tenantId);
    return this.withTenantSchema(tenant.keycloakRealm, async () => {
      const users = await getPrismaClient().user.findMany({
        include: { roles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return users.map((u) => ({
        id: u.id,
        keycloakSubjectId: u.keycloakSubjectId,
        email: u.email,
        fullName: u.fullName,
        status: u.status,
        roles: u.roles.map((r) => r.role.name),
        lastSyncedAt: u.lastSyncedAt,
        createdAt: u.createdAt,
      }));
    });
  }

  @Post()
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTenantAdminUserDto,
    @CurrentPlatformAdmin() actor: PlatformAdminContext,
  ): Promise<{ status: 'queued' }> {
    const tenant = await this.requireTenant(tenantId);

    const subscription = await getPlatformPrismaClient().subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (subscription) {
      const activeCount = await this.withTenantSchema(tenant.keycloakRealm, () => getPrismaClient().user.count({ where: { status: 'ACTIVE' } }));
      if (activeCount >= subscription.plan.seatLimit) {
        throw new BadRequestException(`Tenant is at its seat limit (${subscription.plan.seatLimit} on the ${subscription.plan.name} plan) — increase the plan's seat limit or deactivate an existing user first.`);
      }
    }

    const existing = await this.withTenantSchema(tenant.keycloakRealm, () => getPrismaClient().user.findUnique({ where: { email: dto.email } }));
    if (existing) throw new BadRequestException(`A user with email "${dto.email}" already exists in this tenant`);

    await enqueueCreateTenantAdmin({ tenantId: tenant.id, email: dto.email, fullName: dto.fullName });
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: 'CREATE_TENANT_ADMIN',
      entityType: 'tenants',
      entityId: tenantId,
      detail: { email: dto.email, fullName: dto.fullName },
    });
    return { status: 'queued' };
  }

  @Post(':userId/reset-password')
  @ApiOkResponse({ type: ResetTenantUserPasswordResponseDto })
  async resetPassword(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @CurrentPlatformAdmin() actor: PlatformAdminContext,
  ): Promise<ResetTenantUserPasswordResponseDto> {
    const tenant = await this.requireTenant(tenantId);
    const user = await this.withTenantSchema(tenant.keycloakRealm, () => getPrismaClient().user.findUnique({ where: { id: userId } }));
    if (!user) throw new NotFoundException(`User ${userId} not found in this tenant`);

    const temporaryPassword = generateTemporaryPassword();
    try {
      await this.withTenantSchema(tenant.keycloakRealm, () => this.keycloakAdmin.resetPassword(user.keycloakSubjectId, temporaryPassword));
    } catch (err) {
      throw new BadGatewayException(`Keycloak password reset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: 'RESET_TENANT_USER_PASSWORD',
      entityType: 'tenants',
      entityId: tenantId,
      detail: { userId, email: user.email },
    });
    return { temporaryPassword };
  }

  @Post(':userId/deactivate')
  @ApiOkResponse({ type: TenantUserResponseDto })
  async deactivate(@Param('tenantId') tenantId: string, @Param('userId') userId: string, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<TenantUserResponseDto> {
    return this.setStatus(tenantId, userId, 'DEACTIVATED', false, actor);
  }

  @Post(':userId/reactivate')
  @ApiOkResponse({ type: TenantUserResponseDto })
  async reactivate(@Param('tenantId') tenantId: string, @Param('userId') userId: string, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<TenantUserResponseDto> {
    return this.setStatus(tenantId, userId, 'ACTIVE', true, actor);
  }

  private async setStatus(tenantId: string, userId: string, status: 'ACTIVE' | 'DEACTIVATED', enabled: boolean, actor: PlatformAdminContext): Promise<TenantUserResponseDto> {
    const tenant = await this.requireTenant(tenantId);
    const updated = await this.withTenantSchema(tenant.keycloakRealm, async () => {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException(`User ${userId} not found in this tenant`);
      try {
        await this.keycloakAdmin.setEnabled(user.keycloakSubjectId, enabled);
      } catch (err) {
        throw new BadGatewayException(`Keycloak update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return prisma.user.update({ where: { id: userId }, data: { status }, include: { roles: { include: { role: true } } } });
    });
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: status === 'ACTIVE' ? 'REACTIVATE_TENANT_USER' : 'DEACTIVATE_TENANT_USER',
      entityType: 'tenants',
      entityId: tenantId,
      detail: { userId, email: updated.email },
    });
    return {
      id: updated.id,
      keycloakSubjectId: updated.keycloakSubjectId,
      email: updated.email,
      fullName: updated.fullName,
      status: updated.status,
      roles: updated.roles.map((r) => r.role.name),
      lastSyncedAt: updated.lastSyncedAt,
      createdAt: updated.createdAt,
    };
  }
}
