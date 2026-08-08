import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient, Prisma } from '@topiadesk/db-platform';
import { invalidateTenantRealmCache } from '../../common/auth/tenant-realm-resolver';
import { CreateTenantDto, TenantProvisioningEventResponseDto, TenantResponseDto, UpdateTenantSubscriptionDto } from './dto/tenant.dto';
import { enqueueTenantProvisioning } from './provision-tenant-queue';

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Tenant lifecycle CRUD + provisioning trigger. Creation is deliberately
 * thin — validate the slug is free, create the Tenant row (status
 * PROVISIONING) + its Subscription (status TRIALING), enqueue the actual
 * work, return immediately. The heavy lifting (Postgres schema, Keycloak
 * realm, first admin user, invite email) happens asynchronously in
 * backend/worker's provision-tenant Worker — this endpoint's job is
 * finished once that job is durably queued, not once the tenant is usable.
 * The Global Admin UI polls GET /platform/tenants/:id (or its
 * provisioning-events sub-resource) to show live progress.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/tenants')
export class TenantsController {
  @Post()
  @ApiOkResponse({ type: TenantResponseDto })
  async create(@Body() dto: CreateTenantDto): Promise<TenantResponseDto> {
    const prisma = getPlatformPrismaClient();
    const plan = await prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new BadRequestException(`Plan ${dto.planId} not found`);

    const schemaAndRealmName = `tenant_${dto.slug}`;
    try {
      const tenant = await prisma.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          schemaName: schemaAndRealmName,
          keycloakRealm: schemaAndRealmName,
          primaryContactEmail: dto.primaryContactEmail,
          status: 'PROVISIONING',
          subscription: { create: { planId: dto.planId, status: 'TRIALING' } },
        },
      });
      await enqueueTenantProvisioning(tenant.id);
      return tenant;
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new BadRequestException(`slug "${dto.slug}" is already in use`);
      }
      throw err;
    }
  }

  @Get()
  @ApiOkResponse({ type: [TenantResponseDto] })
  async list(): Promise<TenantResponseDto[]> {
    return getPlatformPrismaClient().tenant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  @ApiOkResponse({ type: TenantResponseDto })
  async get(@Param('id') id: string): Promise<TenantResponseDto & { provisioningEvents: TenantProvisioningEventResponseDto[] }> {
    const tenant = await getPlatformPrismaClient().tenant.findUnique({
      where: { id },
      include: { provisioningEvents: { orderBy: { occurredAt: 'asc' } }, subscription: { include: { plan: true } } },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  @Post(':id/suspend')
  @ApiOkResponse({ type: TenantResponseDto })
  async suspend(@Param('id') id: string): Promise<TenantResponseDto> {
    return this.setStatus(id, 'SUSPENDED');
  }

  @Post(':id/reactivate')
  @ApiOkResponse({ type: TenantResponseDto })
  async reactivate(@Param('id') id: string): Promise<TenantResponseDto> {
    return this.setStatus(id, 'ACTIVE');
  }

  private async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<TenantResponseDto> {
    const prisma = getPlatformPrismaClient();
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    if (tenant.status === 'PROVISIONING' || tenant.status === 'FAILED') {
      throw new BadRequestException(`Cannot ${status === 'ACTIVE' ? 'reactivate' : 'suspend'} a tenant with status ${tenant.status}`);
    }
    const updated = await prisma.tenant.update({ where: { id }, data: { status } });
    // RlsContextMiddleware's resolveActiveTenantByRealm() cache has its own
    // 30s TTL either way — this just makes suspend/reactivate effective
    // immediately instead of waiting out that window.
    await invalidateTenantRealmCache(tenant.keycloakRealm);
    return updated;
  }

  @Get(':id/subscription')
  @ApiOkResponse()
  async getSubscription(@Param('id') id: string) {
    const sub = await getPlatformPrismaClient().subscription.findUnique({ where: { tenantId: id }, include: { plan: true } });
    if (!sub) throw new NotFoundException(`Tenant ${id} has no subscription`);
    return sub;
  }

  @Patch(':id/subscription')
  @ApiOkResponse()
  async updateSubscription(@Param('id') id: string, @Body() dto: UpdateTenantSubscriptionDto) {
    const prisma = getPlatformPrismaClient();
    const sub = await prisma.subscription.findUnique({ where: { tenantId: id } });
    if (!sub) throw new NotFoundException(`Tenant ${id} has no subscription`);
    return prisma.subscription.update({
      where: { tenantId: id },
      data: { planId: dto.planId, status: dto.status },
      include: { plan: true },
    });
  }
}
