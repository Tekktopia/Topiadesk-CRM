import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { PublicTenantLookupResponseDto } from './dto/public-tenant-lookup.dto';

const SUBDOMAIN_PATTERN = /^[a-z0-9-]{1,63}$/;

/**
 * Public, unauthenticated — the one lookup frontend/web needs BEFORE a
 * visitor has logged in: "which Keycloak realm does this subdomain belong
 * to?" (see lib/auth/tenant-realm.ts). Same `public/*` isolation pattern as
 * knowledge-base/public-knowledge.controller.ts and
 * campaigns/public-unsubscribe.controller.ts — excluded from
 * RlsContextMiddleware in app.module.ts, and deliberately never registered
 * in PlatformContextMiddleware's forRoutes() list either.
 *
 * Returns ONLY `keycloakRealm`, and only for an ACTIVE tenant — same gate
 * tenant-realm-resolver.ts's resolveActiveTenantByRealm() uses for live
 * suspension enforcement, so a PROVISIONING/SUSPENDED/FAILED tenant's
 * subdomain fails closed with a clean 404 instead of starting a login flow
 * against a realm that might not be fully set up (or shouldn't be reachable
 * at all).
 */
@ApiTags('public')
@Controller('public/tenant-lookup')
export class PublicTenantLookupController {
  @Get()
  @ApiOkResponse({ type: PublicTenantLookupResponseDto })
  async lookup(@Query('subdomain') subdomain?: string): Promise<PublicTenantLookupResponseDto> {
    if (!subdomain || !SUBDOMAIN_PATTERN.test(subdomain)) {
      throw new NotFoundException();
    }
    // platform.tenants carries the same coarse "any bound RLS context can
    // read it" policy every other SYSTEM_JOB_CONTEXT platform-schema read
    // in this codebase relies on (see tenant-realm-resolver.ts) — with no
    // context bound at all, RLS filters this query down to zero rows
    // regardless of what's actually in the table.
    const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPlatformPrismaClient().tenant.findFirst({
        where: { subdomain, status: 'ACTIVE' },
        select: { keycloakRealm: true },
      }),
    );
    if (!tenant) throw new NotFoundException();
    return { keycloakRealm: tenant.keycloakRealm };
  }
}
