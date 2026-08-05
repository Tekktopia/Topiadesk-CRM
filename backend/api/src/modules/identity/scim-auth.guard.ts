import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { hashScimToken } from './scim-token.util';

/**
 * Bearer-token check for the whole /scim/v2/* route family — deliberately
 * NOT PermissionGuard: the caller is an external IdP/provisioning tool
 * presenting a ScimApiToken, not a TopiaDesk user with a Keycloak-issued
 * JWT and roles (same reasoning as KeycloakWebhookGuard for the Keycloak
 * sync webhook — see keycloak-webhook.guard.ts). This route family is
 * excluded from RlsContextMiddleware in app.module.ts (integration-pass
 * follow-up — see this module's final report for the exact paths), so
 * there's no ambient RLS context to query `scim_api_tokens` under; the
 * lookup itself runs under SYSTEM_JOB_CONTEXT, matching
 * scim_api_tokens_rw's USING/WITH CHECK (ALL-scope 'identity' or
 * SYSTEM_JOB — see prisma/rls/002_policies.sql).
 */
@Injectable()
export class ScimAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed SCIM bearer token');
    }

    const tokenHash = hashScimToken(authHeader.slice('Bearer '.length));
    const prisma = getPrismaClient();
    const token = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () => prisma.scimApiToken.findUnique({ where: { tokenHash } }));

    if (!token || !token.isActive) {
      throw new UnauthorizedException('Invalid or inactive SCIM token');
    }

    // Best-effort last-used bookkeeping — fire-and-forget so a transient
    // write failure here never blocks (or fails) the actual SCIM request
    // it's just recording metadata about.
    runWithRlsContext(SYSTEM_JOB_CONTEXT, () => prisma.scimApiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })).catch(
      () => undefined,
    );

    return true;
  }
}
