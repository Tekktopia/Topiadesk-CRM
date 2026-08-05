import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient } from '@topiadesk/db';
import { encryptToken, decryptToken } from './oauth-token-crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a real login+consent flow, short enough to bound a leaked/logged state value's usefulness
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // refresh if less than 5 minutes of validity remain

interface OAuthConnectorConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes?: string[];
  redirectUri: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Generic OAuth2 authorization-code flow plumbing — reusable across
 * whatever connector.config.oauth points it at, deliberately not a named
 * vendor integration (out of scope per the build brief: "don't build a
 * specific Xero/DocuSign/etc connector"). A connector opts in by setting
 * `IntegrationConnector.config.oauth` to an OAuthConnectorConfig shape —
 * generic JSON config, same pattern the existing MOCK_STUB connector
 * already uses for `config.fixtureEndpoint` (see
 * fixtures/mock-core-broking-fixture.ts).
 */
@Injectable()
export class OAuthConnectorService {
  async buildAuthorizeUrl(connectorId: string): Promise<string> {
    const config = await this.loadOAuthConfig(connectorId);
    const state = this.createState(connectorId);
    const url = new URL(config.authorizeUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    if (config.scopes?.length) url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async handleCallback(connectorId: string, code: string | undefined, state: string | undefined): Promise<{ status: string; provider: string }> {
    if (!code) throw new BadRequestException('Missing authorization code');
    if (!state || !this.verifyState(state, connectorId)) throw new BadRequestException('Missing or invalid/expired state parameter');

    const config = await this.loadOAuthConfig(connectorId);

    let tokenResponse: TokenResponse;
    try {
      tokenResponse = await this.exchangeToken(config, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
    } catch (err) {
      throw new BadGatewayException(`OAuth token exchange failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    await getPrismaClient().integrationOAuthCredential.upsert({
      where: { connectorId_provider: { connectorId, provider: config.provider } },
      update: {
        encryptedAccessToken: encryptToken(tokenResponse.access_token),
        encryptedRefreshToken: tokenResponse.refresh_token ? encryptToken(tokenResponse.refresh_token) : undefined,
        expiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
        scopes: config.scopes ?? [],
      },
      create: {
        connectorId,
        provider: config.provider,
        encryptedAccessToken: encryptToken(tokenResponse.access_token),
        encryptedRefreshToken: tokenResponse.refresh_token ? encryptToken(tokenResponse.refresh_token) : undefined,
        expiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
        scopes: config.scopes ?? [],
      },
    });

    return { status: 'ok', provider: config.provider };
  }

  /**
   * Reusable by future connector-specific code (not called from anywhere in
   * THIS pass — no named vendor connector exists yet, per the build brief).
   * Returns a valid, decrypted access token, transparently refreshing it
   * first if it's within REFRESH_THRESHOLD_MS of expiry and a refresh token
   * is on file.
   */
  async getValidAccessToken(connectorId: string, provider: string): Promise<string> {
    const prisma = getPrismaClient();
    const credential = await prisma.integrationOAuthCredential.findUnique({ where: { connectorId_provider: { connectorId, provider } } });
    if (!credential) throw new NotFoundException(`No OAuth credential on file for connector ${connectorId}/${provider}`);

    const needsRefresh = credential.expiresAt !== null && credential.expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS;
    if (!needsRefresh || !credential.encryptedRefreshToken) {
      return decryptToken(credential.encryptedAccessToken);
    }

    const config = await this.loadOAuthConfig(connectorId);
    let tokenResponse: TokenResponse;
    try {
      tokenResponse = await this.exchangeToken(config, {
        grant_type: 'refresh_token',
        refresh_token: decryptToken(credential.encryptedRefreshToken),
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
    } catch (err) {
      throw new BadGatewayException(`OAuth token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    await prisma.integrationOAuthCredential.update({
      where: { id: credential.id },
      data: {
        encryptedAccessToken: encryptToken(tokenResponse.access_token),
        // Some providers omit refresh_token on refresh responses (it's
        // unchanged) — keep the existing one rather than nulling it out.
        encryptedRefreshToken: tokenResponse.refresh_token ? encryptToken(tokenResponse.refresh_token) : credential.encryptedRefreshToken,
        expiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
      },
    });

    return tokenResponse.access_token;
  }

  private async exchangeToken(config: OAuthConnectorConfig, body: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`token endpoint responded ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as TokenResponse;
  }

  private async loadOAuthConfig(connectorId: string): Promise<OAuthConnectorConfig> {
    const connector = await getPrismaClient().integrationConnector.findUnique({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException(`Integration connector ${connectorId} not found`);
    const oauth = (connector.config as { oauth?: Partial<OAuthConnectorConfig> } | null)?.oauth;
    if (!oauth?.clientId || !oauth.clientSecret || !oauth.authorizeUrl || !oauth.tokenUrl || !oauth.redirectUri || !oauth.provider) {
      throw new BadRequestException(
        `Connector ${connectorId} has no valid config.oauth (needs provider, clientId, clientSecret, authorizeUrl, tokenUrl, redirectUri)`,
      );
    }
    return oauth as OAuthConnectorConfig;
  }

  /**
   * Stateless CSRF state token — HMAC-signed with
   * INTEGRATION_TOKEN_ENCRYPTION_KEY (reused as HMAC key material, not for
   * encryption here; it never leaves this process either way) rather than
   * a server-side session store, since the OAuth callback route has no
   * bound RLS/session context to store one against (see
   * oauth.controller.ts's header comment) and this needs to survive a
   * redirect through a third party.
   */
  private createState(connectorId: string): string {
    const nonce = randomBytes(16).toString('hex');
    const payload = `${connectorId}.${Date.now()}.${nonce}`;
    const signature = this.sign(payload);
    return Buffer.from(`${payload}.${signature}`, 'utf8').toString('base64url');
  }

  private verifyState(state: string, expectedConnectorId: string): boolean {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      const parts = decoded.split('.');
      if (parts.length !== 4) return false;
      const [connectorId, timestampStr, nonce, signature] = parts;
      if (connectorId !== expectedConnectorId) return false;
      const expected = this.sign(`${connectorId}.${timestampStr}.${nonce}`);
      if (expected.length !== signature!.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature!))) return false;
      const timestamp = Number(timestampStr);
      return Number.isFinite(timestamp) && Date.now() - timestamp <= STATE_TTL_MS;
    } catch {
      return false;
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', loadEnv().INTEGRATION_TOKEN_ENCRYPTION_KEY).update(payload).digest('hex');
  }
}
