import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT a type-only import: OAuthConnectorService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { OAuthConnectorService } from './oauth-connector.service';

/**
 * Generic OAuth2 authorization-code plumbing — see oauth-connector.
 * service.ts's header comment for what "generic" means here (not a named
 * vendor connector).
 *
 * /authorize stays behind normal JWT auth (PermissionGuard, 'integration'
 * write) — an admin explicitly starting a connection. /callback CANNOT:
 * the OAuth provider's redirect is a plain browser navigation with no
 * TopiaDesk-issued JWT to attach, so it's excluded from RlsContextMiddleware
 * in app.module.ts (integration-pass follow-up — exact path in this
 * module's final report) and wrapped in
 * runWithRlsContext(SYSTEM_JOB_CONTEXT, ...) instead, same reasoning as
 * keycloak-webhook.controller.ts. It's secured instead by
 * OAuthConnectorService's signed, time-bounded `state` parameter — the
 * closest equivalent to a shared-secret guard this flow allows, since the
 * caller here is the end user's browser, not a system we hold a secret
 * with in advance.
 */
@ApiTags('integrations')
@Controller('integrations/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthConnectorService) {}

  @Get(':connectorId/authorize')
  @UseGuards(PermissionGuard)
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ description: 'Redirects (302) to the connector\'s authorizeUrl' })
  async authorize(@Param('connectorId') connectorId: string, @Res() res: Response): Promise<void> {
    // Runs under the CALLER's own ambient session (RlsContextMiddleware
    // already bound one for this authenticated route) — NOT elevated,
    // matching integrations.service.ts's triggerSync(), which relies on the
    // caller's own ALL-scope 'integration' grant rather than SYSTEM_JOB.
    const url = await this.oauth.buildAuthorizeUrl(connectorId);
    res.redirect(url);
  }

  @Get(':connectorId/callback')
  @ApiExcludeEndpoint() // no auth at all on this route by design — see the class header comment
  async callback(
    @Param('connectorId') connectorId: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
  ): Promise<{ status: string; provider: string }> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.oauth.handleCallback(connectorId, code, state));
  }
}
