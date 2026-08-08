import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getRlsContext } from '@topiadesk/db';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';

export interface KeycloakUserRepresentation {
  id?: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
}

export interface KeycloakSessionRepresentation {
  id: string;
  username: string;
  userId: string;
  ipAddress: string;
  start: number;
  lastAccess: number;
  clients: Record<string, string>;
}

interface CachedAdminToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * Thin wrapper around Keycloak's Admin REST API — realm-aware (Phase 2a):
 * every method operates against WHICHEVER realm the current request's
 * RlsContext.tenantSchema resolves to (via `realmName()`, falling back to
 * `env.KEYCLOAK_REALM` when no context/tenantSchema is bound), since
 * `Tenant.schemaName` and `Tenant.keycloakRealm` are always the identical
 * string by construction (see tenants.controller.ts's create()).
 *
 * Authenticates with the MASTER-realm credentials (KEYCLOAK_ADMIN/
 * KEYCLOAK_ADMIN_PASSWORD, password grant against the built-in `admin-cli`
 * client in the `master` realm) rather than the previous per-realm
 * client-credentials service account — confirmed empirically (via
 * backend/worker/src/jobs/platform/keycloak-realm-provisioning.ts's
 * createTenantAdminUser(), which already does exactly this) that a
 * master-realm token works for `POST /admin/realms/{realm}/...` calls
 * against ANY realm, no per-realm service account needed. Deliberate,
 * confirmed trade-off (not a free simplification): this widens a
 * compromised `api` process's blast radius for this one credential from
 * "one realm" to "every tenant's Keycloak realm" — a per-tenant service-
 * account client (stronger isolation) remains a valid future hardening
 * step, not needed for this pass. One cached token still suffices
 * (master-realm privileges span every realm), so `tokenCache` stays a
 * single value, not a per-realm map.
 *
 * Same lazy/optional-config contract as anthropic-client.ts/
 * voyage-client.ts: every public method fails with a clean
 * ServiceUnavailableException up front if the master credentials aren't
 * configured, rather than letting a `fetch()` call fail opaquely deep
 * inside a request. Implemented as an injectable service (not a bare
 * factory function like getAnthropicClient()) because it also needs to
 * cache the access token across calls within its TTL — that's per-process
 * state a plain function can't hold as cleanly as a singleton-scoped Nest
 * provider.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private tokenCache: CachedAdminToken | undefined;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  isConfigured(): boolean {
    return Boolean(this.env.KEYCLOAK_ADMIN && this.env.KEYCLOAK_ADMIN_PASSWORD);
  }

  async createUser(user: KeycloakUserRepresentation): Promise<string> {
    const res = await this.adminFetch('/users', { method: 'POST', body: JSON.stringify(user) });
    if (res.status !== 201) {
      throw new Error(`Keycloak create-user failed (${res.status}): ${await safeBody(res)}`);
    }
    // Keycloak's create-user response has no body — the new user's id is in
    // the Location header (.../admin/realms/{realm}/users/{id}).
    const location = res.headers.get('location');
    const id = location?.split('/').pop();
    if (!id) throw new Error('Keycloak create-user succeeded but returned no Location header to read the new user id from');
    return id;
  }

  async updateUser(keycloakUserId: string, patch: Partial<KeycloakUserRepresentation>): Promise<void> {
    const res = await this.adminFetch(`/users/${encodeURIComponent(keycloakUserId)}`, { method: 'PUT', body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(`Keycloak update-user failed (${res.status}): ${await safeBody(res)}`);
  }

  async setEnabled(keycloakUserId: string, enabled: boolean): Promise<void> {
    await this.updateUser(keycloakUserId, { enabled });
  }

  /** `PUT .../users/{id}/reset-password` sets a temp password directly (no
   * email round-trip) — the caller decides the value and `temporary: true`
   * forces Keycloak's own UPDATE_PASSWORD flow on next login, same as the
   * initial-creation temp-password pattern in keycloak-realm-provisioning.ts.
   * The password itself is never logged here — callers own not persisting
   * it anywhere beyond a single API response, same discipline as
   * generateTemporaryPassword()'s own doc comment. */
  async resetPassword(keycloakUserId: string, temporaryPassword: string): Promise<void> {
    const res = await this.adminFetch(`/users/${encodeURIComponent(keycloakUserId)}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: temporaryPassword, temporary: true }),
    });
    if (!res.ok) throw new Error(`Keycloak reset-password failed (${res.status}): ${await safeBody(res)}`);
  }

  async findUserByEmail(email: string): Promise<KeycloakUserRepresentation | null> {
    const res = await this.adminFetch(`/users?email=${encodeURIComponent(email)}&exact=true`, { method: 'GET' });
    if (!res.ok) throw new Error(`Keycloak find-user-by-email failed (${res.status}): ${await safeBody(res)}`);
    const users = (await res.json()) as KeycloakUserRepresentation[];
    return users[0] ?? null;
  }

  /** Keycloak's own terminology: POST .../users/{id}/logout invalidates every active session + refresh token for that user. Maps to AuditAction.FORCE_LOGOUT at the call site (identity.controller additions). */
  async forceLogout(keycloakUserId: string): Promise<void> {
    const res = await this.adminFetch(`/users/${encodeURIComponent(keycloakUserId)}/logout`, { method: 'POST' });
    if (!res.ok) throw new Error(`Keycloak force-logout failed (${res.status}): ${await safeBody(res)}`);
  }

  async listSessions(keycloakUserId: string): Promise<KeycloakSessionRepresentation[]> {
    const res = await this.adminFetch(`/users/${encodeURIComponent(keycloakUserId)}/sessions`, { method: 'GET' });
    if (!res.ok) throw new Error(`Keycloak list-sessions failed (${res.status}): ${await safeBody(res)}`);
    return (await res.json()) as KeycloakSessionRepresentation[];
  }

  /** `Tenant.schemaName`/`Tenant.keycloakRealm` are always the identical string by construction — see this class's header comment. */
  private realmName(): string {
    return getRlsContext()?.tenantSchema ?? this.env.KEYCLOAK_REALM;
  }

  private adminBaseUrl(): string {
    // Same internal-vs-public-hostname reasoning as JwtVerifier's
    // resolveInternalJwksUri: *.topiadesk.localhost only resolves via
    // host-machine/browser DNS, not Docker Compose's embedded DNS.
    const base = this.env.KEYCLOAK_INTERNAL_URL ?? this.env.KEYCLOAK_URL;
    return `${base}/admin/realms/${this.realmName()}`;
  }

  private tokenUrl(): string {
    const base = this.env.KEYCLOAK_INTERNAL_URL ?? this.env.KEYCLOAK_URL;
    return `${base}/realms/master/protocol/openid-connect/token`;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    // 5s safety margin so a token doesn't expire mid-flight between this
    // check and the admin call it's about to authorize.
    if (this.tokenCache && this.tokenCache.expiresAtMs > now + 5000) {
      return this.tokenCache.accessToken;
    }
    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: this.env.KEYCLOAK_ADMIN!,
        password: this.env.KEYCLOAK_ADMIN_PASSWORD!,
      }),
    });
    if (!res.ok) {
      throw new Error(`Keycloak admin master-realm token request failed (${res.status}): ${await safeBody(res)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { accessToken: json.access_token, expiresAtMs: now + json.expires_in * 1000 };
    return json.access_token;
  }

  private async adminFetch(path: string, init: RequestInit): Promise<Response> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Keycloak admin integration is not configured: KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD are not set.');
    }
    const token = await this.getAccessToken();
    return fetch(`${this.adminBaseUrl()}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  }
}

async function safeBody(res: Response): Promise<string> {
  return (await res.text().catch(() => '')).slice(0, 500);
}
