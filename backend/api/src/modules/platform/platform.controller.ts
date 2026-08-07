import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import type { PlatformAdminContext } from './platform-context';

/**
 * Home-dashboard stats (tenant counts by status) — Phase 1 scope only, see
 * the plan's own note on this: cross-tenant USAGE stats (seats consumed,
 * last-login activity, ...) need Phase 2/3's cross-schema query work, not
 * built yet. This is exactly what Phase 1 actually has data for.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
export class PlatformController {
  @Get('me')
  @ApiOkResponse()
  me(@CurrentPlatformAdmin() admin: PlatformAdminContext): PlatformAdminContext {
    return admin;
  }

  @Get('stats')
  @ApiOkResponse()
  async stats() {
    const prisma = getPlatformPrismaClient();
    const [total, active, provisioning, suspended, failed] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'PROVISIONING' } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      prisma.tenant.count({ where: { status: 'FAILED' } }),
    ]);
    return { totalTenants: total, active, provisioning, suspended, failed };
  }
}
