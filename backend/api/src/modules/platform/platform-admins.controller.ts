import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { runWithRlsContext, getRlsContext } from '@topiadesk/db';
// NOT a type-only import: KeycloakAdminService is constructor-injected below.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from '../identity/keycloak-admin.service';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import { CreatePlatformAdminDto, PlatformAdminResponseDto, UpdatePlatformAdminRoleDto } from './dto/platform-admin.dto';
import { enqueueCreatePlatformAdmin } from './create-platform-admin-queue';
import { PlatformAuditService } from './platform-audit.service';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import type { PlatformAdminContext } from './platform-context';
import { PlatformRoleGuard } from './platform-role.guard';
import { RequirePlatformRole } from './require-platform-role.decorator';

/** Only ACTIVE rows count toward the "at least one SUPER_ADMIN" floor —
 * an INACTIVE one can't authenticate (PlatformContextMiddleware rejects
 * non-ACTIVE at 403), so it can't act, so it shouldn't count as
 * protection against a lockout. Shared by both the role-change and
 * deactivate paths below — the same lockout risk exists at either one. */
async function assertNotLastSuperAdmin(excludingId: string): Promise<void> {
  const remaining = await getPlatformPrismaClient().platformAdminUser.count({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: excludingId } },
  });
  if (remaining === 0) {
    throw new BadRequestException('This would leave zero active SUPER_ADMIN accounts — promote another admin first.');
  }
}

/**
 * CRUD for the platform's OWN operator accounts (PlatformAdminUser) — the
 * people who sign into Global Admin itself, distinct from TenantUsers
 * managed via tenant-users.controller.ts. Creation is enqueue-and-return,
 * same shape as tenants.controller.ts's create(): the row doesn't exist yet
 * when this returns (the worker creates it after the Keycloak user), so
 * list()/get() won't show a brand-new admin until the job finishes —
 * acceptable, same "poll if you care" UX as tenant provisioning.
 */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformRoleGuard)
@Controller('platform/admins')
export class PlatformAdminsController {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly auditService: PlatformAuditService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [PlatformAdminResponseDto] })
  async list(): Promise<PlatformAdminResponseDto[]> {
    return getPlatformPrismaClient().platformAdminUser.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post()
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  async create(@Body() dto: CreatePlatformAdminDto, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<{ status: 'queued' }> {
    const existing = await getPlatformPrismaClient().platformAdminUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException(`A platform admin with email "${dto.email}" already exists`);
    await enqueueCreatePlatformAdmin({ email: dto.email, fullName: dto.fullName });
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: 'CREATE_PLATFORM_ADMIN',
      entityType: 'platform_admin_users',
      entityId: dto.email,
      detail: { fullName: dto.fullName },
    });
    return { status: 'queued' };
  }

  @Post(':id/deactivate')
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  async deactivate(@Param('id') id: string, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<PlatformAdminResponseDto> {
    return this.setStatus(id, 'INACTIVE', false, actor);
  }

  @Post(':id/reactivate')
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  async reactivate(@Param('id') id: string, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<PlatformAdminResponseDto> {
    return this.setStatus(id, 'ACTIVE', true, actor);
  }

  /**
   * SUPER_ADMIN only (see @RequirePlatformRole on the two public callers
   * above) — a floor check against a pre-existing lockout risk, not new
   * scope creep: nothing stopped deactivating the last SUPER_ADMIN before
   * role tiers existed either, it just didn't matter yet.
   */
  @Patch(':id/role')
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  async updateRole(@Param('id') id: string, @Body() dto: UpdatePlatformAdminRoleDto, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<PlatformAdminResponseDto> {
    const prisma = getPlatformPrismaClient();
    const admin = await prisma.platformAdminUser.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException(`Platform admin ${id} not found`);

    if (admin.role === 'SUPER_ADMIN' && dto.role !== 'SUPER_ADMIN') {
      await assertNotLastSuperAdmin(id);
    }

    const updated = await prisma.platformAdminUser.update({ where: { id }, data: { role: dto.role } });
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: 'CHANGE_PLATFORM_ADMIN_ROLE',
      entityType: 'platform_admin_users',
      entityId: id,
      detail: { from: admin.role, to: dto.role },
    });
    return updated;
  }

  private async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', enabled: boolean, actor: PlatformAdminContext): Promise<PlatformAdminResponseDto> {
    const prisma = getPlatformPrismaClient();
    const admin = await prisma.platformAdminUser.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException(`Platform admin ${id} not found`);

    if (status === 'INACTIVE' && admin.role === 'SUPER_ADMIN') {
      await assertNotLastSuperAdmin(id);
    }

    // KeycloakAdminService.realmName() resolves RlsContext.tenantSchema —
    // a platform-admin session normally has that null (see
    // platform-context.middleware.ts), so it's overridden here to target
    // the "topiadesk-platform" realm instead, exactly the trick this
    // session's plan documents for reaching into a specific Keycloak realm
    // from platform-context code without any change to that service.
    const ctx = getRlsContext();
    await runWithRlsContext({ ...ctx!, tenantSchema: this.env.KEYCLOAK_PLATFORM_REALM }, () => this.keycloakAdmin.setEnabled(admin.keycloakSubjectId, enabled));

    const updated = await prisma.platformAdminUser.update({ where: { id }, data: { status } });
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: status === 'ACTIVE' ? 'REACTIVATE_PLATFORM_ADMIN' : 'DEACTIVATE_PLATFORM_ADMIN',
      entityType: 'platform_admin_users',
      entityId: id,
    });
    return updated;
  }
}
