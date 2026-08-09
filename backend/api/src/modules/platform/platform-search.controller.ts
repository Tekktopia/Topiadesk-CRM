import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { PlatformRoleGuard } from './platform-role.guard';
import { PlatformSearchQueryDto, PlatformSearchResponseDto, type PlatformSearchResultDto } from './dto/platform-search.dto';

/**
 * Global Admin's ⌘K search — the platform-schema counterpart to
 * backend/api/src/modules/search/search.controller.ts (same fan-out
 * shape, applied to Tenant/Plan/PlatformAdminUser/SupportTicket instead
 * of the tenant-schema CRM entities).
 *
 * No @RequirePlatformRole — deliberately ungated beyond "is an
 * authenticated platform admin" (@UseGuards(PlatformRoleGuard) with no
 * decorator still requires that, same as every other ungated platform
 * controller — see platform-role.guard.ts). Searching is a read-only
 * convenience, not a privileged action; a SUPPORT-tier admin needs it as
 * much as a SUPER_ADMIN does.
 */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformRoleGuard)
@Controller('platform/search')
export class PlatformSearchController {
  @Get()
  @ApiOkResponse({ type: PlatformSearchResponseDto })
  async search(@Query() query: PlatformSearchQueryDto): Promise<PlatformSearchResponseDto> {
    const prisma = getPlatformPrismaClient();
    const q = query.q;
    const take = query.limit ?? 5;
    const insensitiveContains = { contains: q, mode: 'insensitive' as const };

    const [tenants, plans, admins, tickets] = await Promise.all([
      prisma.tenant.findMany({
        where: { OR: [{ name: insensitiveContains }, { slug: insensitiveContains }, { primaryContactEmail: insensitiveContains }] },
        take,
        select: { id: true, name: true, status: true },
      }),
      prisma.plan.findMany({ where: { name: insensitiveContains }, take, select: { id: true, name: true, seatLimit: true } }),
      prisma.platformAdminUser.findMany({
        where: { OR: [{ fullName: insensitiveContains }, { email: insensitiveContains }] },
        take,
        select: { id: true, fullName: true, email: true },
      }),
      prisma.supportTicket.findMany({ where: { subject: insensitiveContains }, take, select: { id: true, subject: true, status: true } }),
    ]);

    const results: PlatformSearchResultDto[] = [
      ...tenants.map((t): PlatformSearchResultDto => ({ id: t.id, type: 'TENANT', title: t.name, subtitle: t.status, href: `/tenants/${t.id}` })),
      // /plans and /admins have no [id] detail route today — flat list
      // pages, so these link to the list, same convention
      // search.controller.ts already uses for TASK (href: '/tasks').
      ...plans.map((p): PlatformSearchResultDto => ({ id: p.id, type: 'PLAN', title: p.name, subtitle: `${p.seatLimit} seats`, href: '/plans' })),
      ...admins.map((a): PlatformSearchResultDto => ({ id: a.id, type: 'PLATFORM_ADMIN', title: a.fullName, subtitle: a.email, href: '/admins' })),
      ...tickets.map((t): PlatformSearchResultDto => ({ id: t.id, type: 'SUPPORT_TICKET', title: t.subject, subtitle: t.status, href: `/support-tickets/${t.id}` })),
    ];

    return { results };
  }
}
