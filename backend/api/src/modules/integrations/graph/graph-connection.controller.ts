import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { getPrismaClient, getRlsContext, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { loadEnv } from '@topiadesk/config';
import { PermissionGuard } from '../../../common/auth/permission.guard';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { encryptToken } from '../oauth-token-crypto';
// NOT type-only: @Body()/@Query() parameter types need a runtime value for
// ValidationPipe to resolve the metatype.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GraphConnectionStatusDto, UpdateGraphConnectionDto } from './graph-connection.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GraphSyncService } from './graph-sync.service';

/** Delegated scopes. Read-only on purpose — this pulls Outlook INTO the CRM. */
const GRAPH_SCOPES = ['offline_access', 'openid', 'profile', 'User.Read', 'Calendars.Read', 'Mail.Read'];

/**
 * Connecting a producer's own Microsoft 365 mailbox.
 *
 * Per-user delegated OAuth, so every endpoint here acts on the CALLER's own
 * connection — there is deliberately no way to read or alter someone else's
 * mailbox link, and RLS enforces the same rule underneath (see
 * microsoft_graph_connections_rw). No 'integration' permission is required:
 * connecting your own mailbox is a personal setting, not an admin action.
 */
@ApiTags('integrations')
@Controller('integrations/microsoft')
export class GraphConnectionController {
  constructor(private readonly sync: GraphSyncService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(PermissionGuard)
  @ApiOkResponse({ type: GraphConnectionStatusDto })
  async status(@CurrentUser() user: AuthenticatedUser): Promise<GraphConnectionStatusDto> {
    const connection = await getPrismaClient().microsoftGraphConnection.findUnique({
      where: { userId: user.id },
      include: { syncStates: true },
    });
    if (!connection) {
      return {
        connected: false,
        configured: isConfigured(),
        microsoftUpn: null,
        status: null,
        calendarSyncEnabled: false,
        mailSyncEnabled: false,
        lastSyncedAt: null,
        lastSyncError: null,
      };
    }
    return {
      connected: true,
      configured: isConfigured(),
      microsoftUpn: connection.microsoftUpn,
      status: connection.status,
      calendarSyncEnabled: connection.calendarSyncEnabled,
      mailSyncEnabled: connection.mailSyncEnabled,
      lastSyncedAt: connection.lastSyncedAt,
      lastSyncError: connection.lastSyncError,
    };
  }

  /**
   * Starts consent. `state` carries the user id, the tenant schema and a
   * nonce: the callback is unauthenticated (Microsoft redirects the browser
   * there with no session of ours), so it can recover neither WHOSE mailbox
   * this is nor WHICH tenant to write it to from anywhere else.
   */
  @Get('authorize')
  @ApiBearerAuth()
  @UseGuards(PermissionGuard)
  async authorize(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    if (!isConfigured()) {
      throw new BadRequestException(
        'Microsoft 365 is not configured on this deployment. Set MICROSOFT_IDP_TENANT_ID, MICROSOFT_IDP_CLIENT_ID and MICROSOFT_IDP_CLIENT_SECRET.',
      );
    }
    const env = loadEnv();
    // state carries userId AND the tenant schema: the callback is
    // unauthenticated, so neither can be recovered from a session there.
    const tenantSchema = getRlsContext()?.tenantSchema ?? '';
    const state = `${user.id}.${tenantSchema}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_IDP_CLIENT_ID ?? '',
      response_type: 'code',
      redirect_uri: `${env.API_URL}/integrations/microsoft/callback`,
      response_mode: 'query',
      scope: GRAPH_SCOPES.join(' '),
      state,
    });
    res.redirect(`https://login.microsoftonline.com/${env.MICROSOFT_IDP_TENANT_ID}/oauth2/v2.0/authorize?${params}`);
  }

  /**
   * Consent callback. Unauthenticated by design — Microsoft redirects the
   * browser here — so the acting user is taken from `state`, and every write
   * runs under SYSTEM_JOB rather than a caller context that doesn't exist.
   */
  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const env = loadEnv();
    const [userId, stateSchema] = state?.split('.') ?? [];
    const tenantSchema = stateSchema || null;
    if (!code || !userId) {
      res.redirect(await tenantProfileUrl(tenantSchema, '?microsoft=error'));
      return;
    }

    const body = new URLSearchParams({
      client_id: env.MICROSOFT_IDP_CLIENT_ID ?? '',
      client_secret: env.MICROSOFT_IDP_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.API_URL}/integrations/microsoft/callback`,
      scope: GRAPH_SCOPES.join(' '),
    });

    const tokenRes = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_IDP_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      res.redirect(await tenantProfileUrl(tenantSchema, '?microsoft=error'));
      return;
    }
    const token = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in?: number };

    // Identify the mailbox from Graph itself rather than trusting the id
    // token: microsoftUserId is what survives a UPN rename.
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) {
      res.redirect(await tenantProfileUrl(tenantSchema, '?microsoft=error'));
      return;
    }
    const me = (await meRes.json()) as { id: string; userPrincipalName?: string; mail?: string };
    const upn = me.userPrincipalName ?? me.mail ?? '';

    await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, async () => {
      const prisma = getPrismaClient();
      await prisma.microsoftGraphConnection.upsert({
        where: { userId },
        create: {
          userId,
          microsoftUserId: me.id,
          microsoftUpn: upn,
          encryptedAccessToken: encryptToken(token.access_token),
          encryptedRefreshToken: token.refresh_token ? encryptToken(token.refresh_token) : null,
          expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
          scopes: GRAPH_SCOPES,
          status: 'CONNECTED',
        },
        update: {
          microsoftUserId: me.id,
          microsoftUpn: upn,
          encryptedAccessToken: encryptToken(token.access_token),
          encryptedRefreshToken: token.refresh_token ? encryptToken(token.refresh_token) : undefined,
          expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
          scopes: GRAPH_SCOPES,
          // Reconnecting is how a NEEDS_RECONSENT connection is repaired.
          status: 'CONNECTED',
          lastSyncError: null,
        },
      });
    });

    res.redirect(await tenantProfileUrl(tenantSchema, '?microsoft=connected'));
  }

  @Patch()
  @ApiBearerAuth()
  @UseGuards(PermissionGuard)
  @ApiOkResponse({ type: GraphConnectionStatusDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateGraphConnectionDto,
  ): Promise<GraphConnectionStatusDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.microsoftGraphConnection.findUnique({ where: { userId: user.id } });
    if (!existing) throw new BadRequestException('No Microsoft 365 mailbox is connected.');
    await prisma.microsoftGraphConnection.update({
      where: { userId: user.id },
      data: {
        calendarSyncEnabled: dto.calendarSyncEnabled === undefined ? undefined : dto.calendarSyncEnabled === 'true',
        mailSyncEnabled: dto.mailSyncEnabled === undefined ? undefined : dto.mailSyncEnabled === 'true',
      },
    });
    return this.status(user);
  }

  /** Run a sync immediately rather than waiting for the scheduled job. */
  @Post('sync')
  @ApiBearerAuth()
  @UseGuards(PermissionGuard)
  async syncNow(@CurrentUser() user: AuthenticatedUser): Promise<{ results: unknown[] }> {
    const connection = await getPrismaClient().microsoftGraphConnection.findUnique({ where: { userId: user.id } });
    if (!connection) throw new BadRequestException('No Microsoft 365 mailbox is connected.');
    const results = await this.sync.syncConnection(connection);
    return { results };
  }

  /**
   * Disconnect. Deletes the stored tokens outright rather than flagging the
   * row disabled — a mailbox someone has unlinked should not leave live
   * credentials sitting in the database. Activities already synced stay:
   * they are a record of real interactions, not a cache of the mailbox.
   */
  @Delete()
  @ApiBearerAuth()
  @UseGuards(PermissionGuard)
  async disconnect(@CurrentUser() user: AuthenticatedUser): Promise<{ disconnected: boolean }> {
    await getPrismaClient().microsoftGraphConnection.deleteMany({ where: { userId: user.id } });
    return { disconnected: true };
  }
}

/**
 * Where to send the browser after consent.
 *
 * NOT `env.APP_URL`. That is `https://app.<root domain>`, a host no tenant
 * maps to — a SCIB user sent there after connecting their mailbox lands on a
 * 403 having successfully completed Microsoft consent. The user must return
 * to the subdomain they started from.
 *
 * The tenant's schema name is on the RLS context, so the subdomain is looked
 * up from the platform registry and the root domain derived by stripping the
 * `app.` prefix — the same derivation tenants.controller.ts and
 * keycloak-realm-provisioning.ts already use.
 */
async function tenantProfileUrl(tenantSchema: string | null, suffix: string): Promise<string> {
  const env = loadEnv();
  const root = new URL(env.APP_URL).host.replace(/^app\./, '');
  if (!tenantSchema) return `${env.APP_URL}/profile${suffix}`;
  const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findFirst({ where: { schemaName: tenantSchema }, select: { subdomain: true } }),
  );
  // A tenant with no subdomain (legacy/irregular row) genuinely has nowhere
  // else to go, so the app host stays the documented fallback.
  if (!tenant?.subdomain) return `${env.APP_URL}/profile${suffix}`;
  return `https://${tenant.subdomain}.${root}/profile${suffix}`;
}

function isConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.MICROSOFT_IDP_TENANT_ID && env.MICROSOFT_IDP_CLIENT_ID && env.MICROSOFT_IDP_CLIENT_SECRET);
}
