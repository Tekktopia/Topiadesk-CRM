import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { runWithRlsContext, getRlsContext } from '@topiadesk/db';
// NOT a type-only import: KeycloakAdminService is constructor-injected below.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from '../identity/keycloak-admin.service';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import { CreatePlatformAdminDto, PlatformAdminResponseDto } from './dto/platform-admin.dto';
import { enqueueCreatePlatformAdmin } from './create-platform-admin-queue';

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
@Controller('platform/admins')
export class PlatformAdminsController {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [PlatformAdminResponseDto] })
  async list(): Promise<PlatformAdminResponseDto[]> {
    return getPlatformPrismaClient().platformAdminUser.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post()
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  async create(@Body() dto: CreatePlatformAdminDto): Promise<{ status: 'queued' }> {
    const existing = await getPlatformPrismaClient().platformAdminUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException(`A platform admin with email "${dto.email}" already exists`);
    await enqueueCreatePlatformAdmin({ email: dto.email, fullName: dto.fullName });
    return { status: 'queued' };
  }

  @Post(':id/deactivate')
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  async deactivate(@Param('id') id: string): Promise<PlatformAdminResponseDto> {
    return this.setStatus(id, 'INACTIVE', false);
  }

  @Post(':id/reactivate')
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  async reactivate(@Param('id') id: string): Promise<PlatformAdminResponseDto> {
    return this.setStatus(id, 'ACTIVE', true);
  }

  private async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', enabled: boolean): Promise<PlatformAdminResponseDto> {
    const prisma = getPlatformPrismaClient();
    const admin = await prisma.platformAdminUser.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException(`Platform admin ${id} not found`);

    // KeycloakAdminService.realmName() resolves RlsContext.tenantSchema —
    // a platform-admin session normally has that null (see
    // platform-context.middleware.ts), so it's overridden here to target
    // the "topiadesk-platform" realm instead, exactly the trick this
    // session's plan documents for reaching into a specific Keycloak realm
    // from platform-context code without any change to that service.
    const ctx = getRlsContext();
    await runWithRlsContext({ ...ctx!, tenantSchema: this.env.KEYCLOAK_PLATFORM_REALM }, () => this.keycloakAdmin.setEnabled(admin.keycloakSubjectId, enabled));

    return prisma.platformAdminUser.update({ where: { id }, data: { status } });
  }
}
