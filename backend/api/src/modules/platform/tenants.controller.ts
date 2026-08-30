import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient, Prisma } from '@topiadesk/db-platform';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { invalidateTenantRealmCache } from '../../common/auth/tenant-realm-resolver';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import { CreateTenantDto, TenantProvisioningEventResponseDto, TenantResponseDto, UpdateTenantSubscriptionDto } from './dto/tenant.dto';
import { TenantAdminSummaryDto, TenantHealthDto, TenantUsageDto, type TenantHealth } from './dto/tenant-user.dto';
import { enqueueTenantProvisioning } from './provision-tenant-queue';
import { PlatformAuditService } from './platform-audit.service';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import type { PlatformAdminContext } from './platform-context';
import { PlatformRoleGuard } from './platform-role.guard';
import { RequirePlatformRole } from './require-platform-role.decorator';

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Slugs that must never be assignable to a tenant — each already routes
 * to a fixed, non-tenant service at that exact subdomain (see
 * docker-compose.yml's Traefik router labels). Traefik's explicit router
 * priorities already prevent a collision from ever being reachable, but a
 * tenant should never be allowed to pick one of these in the first place —
 * defense in depth, not the only guard. */
const RESERVED_TENANT_SLUGS = new Set(['app', 'platform', 'api', 'auth', 'www', 'admin', 'portal', 'kb', 'static', 'assets']);

/** Lossy-but-safe one-way substitution, same as
 * keycloak-realm-provisioning.ts's slugToHostLabel() — DNS hostname labels
 * don't allow underscores (RFC 1123), tenant slugs do. Duplicated rather
 * than imported across the api/worker deployable boundary, matching this
 * codebase's established convention (see generateTemporaryPassword()). */
function slugToSubdomain(slug: string): string {
  return slug.replace(/_/g, '-');
}

/** No date-fns dependency in this app yet for one calculation — JS's own
 * Date arithmetic rolls over correctly for month-end overflow (e.g. Jan 31
 * + 1 month -> Mar 3, not an invalid "Feb 31"), which is the standard,
 * accepted behavior for this kind of "N months from now" calculation. */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Composite health signal, deliberately built only from data that's
 * already real today — Subscription status/currentPeriodEnd, seat
 * utilization, and open SupportTicket counts/priority. No "last active"
 * factor: nothing in the platform OR tenant schema tracks login/request
 * recency (RlsContextMiddleware and tenant-realm-resolver.ts are both
 * read-only, confirmed), so that's out of scope until real instrumentation
 * exists, not faked from a proxy signal.
 *
 * Only meaningful for ACTIVE tenants — callers should skip this for
 * PROVISIONING/SUSPENDED/FAILED/DELETED, which already have their own
 * clear signal via TenantStatusBadge.
 */
function computeTenantHealth(opts: {
  subscriptionStatus: string | undefined;
  currentPeriodEnd: Date | null | undefined;
  totalUsers: number;
  seatLimit: number | null;
  tickets: { total: number; urgent: number; high: number };
}): { health: TenantHealth; healthReasons: string[] } {
  const reasons: string[] = [];
  // Plain `number`, not a `0 | 1 | 2` literal union — TS's control-flow
  // narrowing doesn't widen a closure-mutated outer variable back after
  // calling the function that mutates it, so a narrow literal type here
  // would make the `severity === 2` check below a false "no overlap" error
  // even though bump() can genuinely set it to 2.
  let severity = 0;
  const bump = (level: 1 | 2, reason: string) => {
    reasons.push(reason);
    if (level > severity) severity = level;
  };

  if (opts.subscriptionStatus === 'PAST_DUE') bump(2, 'Subscription past due');
  if (opts.subscriptionStatus === 'CANCELED') bump(2, 'Subscription canceled');
  if (opts.tickets.urgent > 0) bump(2, `${opts.tickets.urgent} urgent support ticket${opts.tickets.urgent > 1 ? 's' : ''} open`);

  if (opts.currentPeriodEnd) {
    const days = Math.ceil((opts.currentPeriodEnd.getTime() - Date.now()) / 86_400_000);
    if (days < 0 && opts.subscriptionStatus !== 'PAST_DUE' && opts.subscriptionStatus !== 'CANCELED') {
      bump(2, 'Subscription period expired');
    } else if (days <= 14) {
      // Same 14-day threshold the tenant detail page's own daysUntil() already warns on.
      bump(1, `Subscription renews in ${days}d`);
    }
  }
  if (opts.seatLimit && opts.totalUsers >= opts.seatLimit) {
    // Same threshold the Usage tab's own atLimit warning already uses.
    bump(1, `At seat limit (${opts.totalUsers}/${opts.seatLimit})`);
  }
  if (opts.tickets.high > 0) bump(1, `${opts.tickets.high} high-priority ticket${opts.tickets.high > 1 ? 's' : ''} open`);
  if (opts.tickets.total >= 3) bump(1, `${opts.tickets.total} open support tickets`);

  return { health: severity === 2 ? 'CRITICAL' : severity === 1 ? 'AT_RISK' : 'HEALTHY', healthReasons: reasons };
}

interface TicketRiskCounts {
  total: number;
  urgent: number;
  high: number;
}

const OPEN_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_TENANT'] as const;

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
@UseGuards(PlatformRoleGuard)
@Controller('platform/tenants')
export class TenantsController {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly auditService: PlatformAuditService,
  ) {}

  /** Strips only env.APP_URL's OWN leftmost label (whatever it's actually
   * named — this deployment's is "tekktopia-app", not literally "app") to
   * get the root domain every tenant subdomain hangs off of. Same
   * derivation as keycloak-realm-provisioning.ts's tenantRootDomain() (see
   * its comment for the bug a hardcoded `/^app\./` strip caused live),
   * computed here instead of imported for the same api/worker
   * deployable-boundary reason as slugToSubdomain() above. */
  private tenantUrl(subdomain: string | null): string | null {
    if (!subdomain) return null;
    const appHost = new URL(this.env.APP_URL).host;
    const root = appHost.split('.').slice(1).join('.') || appHost;
    return `https://${subdomain}.${root}`;
  }

  @Post()
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: TenantResponseDto })
  async create(@Body() dto: CreateTenantDto, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<TenantResponseDto> {
    if (RESERVED_TENANT_SLUGS.has(dto.slug) || RESERVED_TENANT_SLUGS.has(slugToSubdomain(dto.slug))) {
      throw new BadRequestException(`slug "${dto.slug}" is reserved and cannot be used for a tenant`);
    }
    const prisma = getPlatformPrismaClient();
    const plan = await prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new BadRequestException(`Plan ${dto.planId} not found`);

    const schemaAndRealmName = `tenant_${dto.slug}`;
    const subdomain = slugToSubdomain(dto.slug);
    try {
      const tenant = await prisma.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          schemaName: schemaAndRealmName,
          keycloakRealm: schemaAndRealmName,
          subdomain,
          primaryContactEmail: dto.primaryContactEmail,
          status: 'PROVISIONING',
          subscription: { create: { planId: dto.planId, status: 'TRIALING' } },
        },
      });
      await enqueueTenantProvisioning(tenant.id);
      await this.auditService.recordEvent({
        actorPlatformAdminId: actor.id,
        action: 'CREATE_TENANT',
        entityType: 'tenants',
        entityId: tenant.id,
        detail: { name: dto.name, slug: dto.slug, planId: dto.planId },
      });
      return { ...tenant, tenantUrl: this.tenantUrl(tenant.subdomain) };
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
    const tenants = await getPlatformPrismaClient().tenant.findMany({ orderBy: { createdAt: 'desc' } });
    return tenants.map((tenant) => ({ ...tenant, tenantUrl: this.tenantUrl(tenant.subdomain) }));
  }

  /**
   * One row per tenant with its total/admin user counts — backs both the
   * "Tenant Admins" and "Usage & Monitoring" nav pages. Declared BEFORE
   * `:id` below: Nest matches routes in declaration order within a
   * controller, and "admin-summary" would otherwise be captured by `:id`.
   * Loops over tenants (one tenant-schema query pair each) — acceptable at
   * Phase 1 tenant-count scale, see this session's plan for when that
   * stops being true.
   */
  @Get('admin-summary')
  @ApiOkResponse({ type: [TenantAdminSummaryDto] })
  async adminSummary(): Promise<TenantAdminSummaryDto[]> {
    const platformPrisma = getPlatformPrismaClient();
    const tenants = await platformPrisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      include: { subscription: { include: { plan: true } } },
    });

    const ticketGroups = await platformPrisma.supportTicket.groupBy({
      by: ['tenantId', 'priority'],
      where: { status: { in: [...OPEN_TICKET_STATUSES] } },
      _count: true,
    });
    const ticketsByTenant = new Map<string, TicketRiskCounts>();
    for (const g of ticketGroups) {
      const counts = ticketsByTenant.get(g.tenantId) ?? { total: 0, urgent: 0, high: 0 };
      counts.total += g._count;
      if (g.priority === 'URGENT') counts.urgent += g._count;
      if (g.priority === 'HIGH') counts.high += g._count;
      ticketsByTenant.set(g.tenantId, counts);
    }

    return Promise.all(
      tenants.map(async (tenant) => {
        const seatLimit = tenant.subscription?.plan.seatLimit ?? null;
        const tickets = ticketsByTenant.get(tenant.id) ?? { total: 0, urgent: 0, high: 0 };
        try {
          const [totalUsers, adminCount] = await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: tenant.keycloakRealm }, () => {
            const prisma = getPrismaClient();
            return Promise.all([prisma.user.count(), prisma.user.count({ where: { roles: { some: { role: { name: 'ADMIN' } } } } })]);
          });
          const { health, healthReasons } = computeTenantHealth({
            subscriptionStatus: tenant.subscription?.status,
            currentPeriodEnd: tenant.subscription?.currentPeriodEnd,
            totalUsers,
            seatLimit,
            tickets,
          });
          return { tenantId: tenant.id, tenantName: tenant.name, status: tenant.status, totalUsers, adminCount, seatLimit, health, healthReasons };
        } catch (err) {
          // A tenant whose keycloakRealm/schemaName doesn't match the
          // tenant_<slug> convention (e.g. a legacy fixture predating
          // proper multi-tenant provisioning) would otherwise fail this
          // whole endpoint for every tenant, not just itself — surfaced
          // live via exactly that. -1 signals "couldn't be read", not 0
          // ("confirmed empty"), so the UI can tell the two apart.
          console.error(`[tenants.adminSummary] failed to read user counts for tenant ${tenant.id} (${tenant.name}):`, err);
          // Still computable from subscription/tickets alone — totalUsers=-1
          // just means the seat-limit factor can't fire (0 >= seatLimit is
          // never true for a positive seatLimit), not that health is unknown.
          const { health, healthReasons } = computeTenantHealth({
            subscriptionStatus: tenant.subscription?.status,
            currentPeriodEnd: tenant.subscription?.currentPeriodEnd,
            totalUsers: 0,
            seatLimit,
            tickets,
          });
          return { tenantId: tenant.id, tenantName: tenant.name, status: tenant.status, totalUsers: -1, adminCount: -1, seatLimit, health, healthReasons };
        }
      }),
    );
  }

  /**
   * Fuller per-tenant breakdown than admin-summary's one-row-per-tenant
   * shape — backs the tenant detail page's Usage tab. Same
   * `{...SYSTEM_JOB_CONTEXT, tenantSchema}` reach-into-a-tenant-schema
   * pattern as tenant-users.controller.ts.
   */
  @Get(':id/usage')
  @ApiOkResponse({ type: TenantUsageDto })
  async usage(@Param('id') id: string): Promise<TenantUsageDto> {
    const tenant = await getPlatformPrismaClient().tenant.findUnique({ where: { id }, include: { subscription: { include: { plan: true } } } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);

    const [totalUsers, activeUsers, deactivatedUsers, suspendedUsers, adminCount] = await runWithRlsContext(
      { ...SYSTEM_JOB_CONTEXT, tenantSchema: tenant.keycloakRealm },
      () => {
        const prisma = getPrismaClient();
        return Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { status: 'ACTIVE' } }),
          prisma.user.count({ where: { status: 'DEACTIVATED' } }),
          prisma.user.count({ where: { status: 'SUSPENDED' } }),
          prisma.user.count({ where: { roles: { some: { role: { name: 'ADMIN' } } } } }),
        ]);
      },
    );

    return {
      totalUsers,
      activeUsers,
      deactivatedUsers,
      suspendedUsers,
      adminCount,
      planName: tenant.subscription?.plan.name ?? null,
      seatLimit: tenant.subscription?.plan.seatLimit ?? null,
    };
  }

  /**
   * A separate endpoint rather than folded into usage() or get() — get()
   * is polled every 3s during provisioning by the tenant detail page's
   * refetchInterval, and adding cross-schema usage reads plus a ticket
   * groupBy to that hot path would be wasteful for data that only needs
   * to refresh on a normal page-view cadence.
   */
  @Get(':id/health')
  @ApiOkResponse({ type: TenantHealthDto })
  async health(@Param('id') id: string): Promise<TenantHealthDto> {
    const tenant = await getPlatformPrismaClient().tenant.findUnique({ where: { id }, include: { subscription: { include: { plan: true } } } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);

    // tenantSchema must be schemaName, NOT keycloakRealm — these two
    // usually match (both `tenant_<slug>`) but aren't guaranteed to (a
    // legacy tenant predating that convention can have schemaName='public'
    // and keycloakRealm as something else entirely). Falls back to
    // totalUsers=0 on a read failure rather than 500ing the whole tenant
    // detail page — same "still computable from subscription/tickets
    // alone" reasoning as adminSummary()'s catch branch above.
    let totalUsers = 0;
    try {
      totalUsers = await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: tenant.schemaName }, () => getPrismaClient().user.count());
    } catch (err) {
      console.error(`[tenants.health] failed to read user count for tenant ${id} (${tenant.name}):`, err);
    }
    const ticketGroups = await getPlatformPrismaClient().supportTicket.groupBy({
      by: ['priority'],
      where: { tenantId: id, status: { in: [...OPEN_TICKET_STATUSES] } },
      _count: true,
    });
    const tickets = ticketGroups.reduce<TicketRiskCounts>(
      (acc, g) => {
        acc.total += g._count;
        if (g.priority === 'URGENT') acc.urgent += g._count;
        if (g.priority === 'HIGH') acc.high += g._count;
        return acc;
      },
      { total: 0, urgent: 0, high: 0 },
    );

    return computeTenantHealth({
      subscriptionStatus: tenant.subscription?.status,
      currentPeriodEnd: tenant.subscription?.currentPeriodEnd,
      totalUsers,
      seatLimit: tenant.subscription?.plan.seatLimit ?? null,
      tickets,
    });
  }

  @Get(':id')
  @ApiOkResponse({ type: TenantResponseDto })
  async get(@Param('id') id: string): Promise<TenantResponseDto & { provisioningEvents: TenantProvisioningEventResponseDto[] }> {
    const tenant = await getPlatformPrismaClient().tenant.findUnique({
      where: { id },
      include: { provisioningEvents: { orderBy: { occurredAt: 'asc' } }, subscription: { include: { plan: true } } },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return { ...tenant, tenantUrl: this.tenantUrl(tenant.subdomain) };
  }

  @Post(':id/suspend')
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: TenantResponseDto })
  async suspend(@Param('id') id: string, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<TenantResponseDto> {
    return this.setStatus(id, 'SUSPENDED', actor);
  }

  @Post(':id/reactivate')
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: TenantResponseDto })
  async reactivate(@Param('id') id: string, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<TenantResponseDto> {
    return this.setStatus(id, 'ACTIVE', actor);
  }

  private async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', actor: PlatformAdminContext): Promise<TenantResponseDto> {
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
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: status === 'ACTIVE' ? 'REACTIVATE_TENANT' : 'SUSPEND_TENANT',
      entityType: 'tenants',
      entityId: id,
    });
    await prisma.platformNotification.create({
      data: {
        type: status === 'ACTIVE' ? 'TENANT_REACTIVATED' : 'TENANT_SUSPENDED',
        title: `Tenant "${tenant.name}" ${status === 'ACTIVE' ? 'reactivated' : 'suspended'}`,
        entityType: 'tenants',
        entityId: id,
      },
    });
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
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse()
  async updateSubscription(@Param('id') id: string, @Body() dto: UpdateTenantSubscriptionDto, @CurrentPlatformAdmin() actor: PlatformAdminContext) {
    const prisma = getPlatformPrismaClient();
    const sub = await prisma.subscription.findUnique({ where: { tenantId: id } });
    if (!sub) throw new NotFoundException(`Tenant ${id} has no subscription`);
    const currentPeriodEnd = dto.durationMonths ? addMonths(new Date(), dto.durationMonths) : undefined;
    const updated = await prisma.subscription.update({
      where: { tenantId: id },
      data: { planId: dto.planId, status: dto.status, currentPeriodEnd },
      include: { plan: true },
    });
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: 'UPDATE_TENANT_SUBSCRIPTION',
      entityType: 'tenants',
      entityId: id,
      detail: { planId: dto.planId, status: dto.status, durationMonths: dto.durationMonths },
    });
    return updated;
  }
}
