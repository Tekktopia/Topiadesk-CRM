import { loadEnv } from '@topiadesk/config';

/**
 * Shared master-realm Keycloak Admin API client — extracted from
 * jobs/platform/keycloak-realm-provisioning.ts (that file's own original
 * header comment explains why this needs real MASTER-realm credentials
 * rather than backend/api's KeycloakAdminService, which is scoped to a
 * single realm's service account). jobs/security-monitoring/
 * detect-anomalies.job.ts needs the exact same master-token client to poll
 * each tenant realm's admin events endpoint, hence pulling this out to a
 * shared file instead of a second copy of the token-cache logic.
 */

interface CachedMasterToken {
  accessToken: string;
  expiresAtMs: number;
}

let masterTokenCache: CachedMasterToken | undefined;

function requireMasterCredentials(): { username: string; password: string } {
  const env = loadEnv();
  if (!env.KEYCLOAK_ADMIN || !env.KEYCLOAK_ADMIN_PASSWORD) {
    throw new Error('KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD are not configured — this operation requires master-realm credentials.');
  }
  return { username: env.KEYCLOAK_ADMIN, password: env.KEYCLOAK_ADMIN_PASSWORD };
}

export function keycloakBaseUrl(): string {
  // Same internal-vs-public-hostname reasoning as KeycloakAdminService's
  // adminBaseUrl(): *.topiadesk.localhost only resolves via host-machine/
  // browser DNS, not Docker Compose's embedded DNS.
  const env = loadEnv();
  return env.KEYCLOAK_INTERNAL_URL ?? env.KEYCLOAK_URL;
}

async function getMasterAccessToken(): Promise<string> {
  const now = Date.now();
  if (masterTokenCache && masterTokenCache.expiresAtMs > now + 5000) {
    return masterTokenCache.accessToken;
  }
  const { username, password } = requireMasterCredentials();
  const res = await fetch(`${keycloakBaseUrl()}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username, password }),
  });
  if (!res.ok) {
    throw new Error(`Keycloak master-realm token request failed (${res.status}): ${await safeBody(res)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  masterTokenCache = { accessToken: json.access_token, expiresAtMs: now + json.expires_in * 1000 };
  return json.access_token;
}

export async function masterFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await getMasterAccessToken();
  return fetch(`${keycloakBaseUrl()}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

export async function safeBody(res: Response): Promise<string> {
  return (await res.text().catch(() => '')).slice(0, 500);
}
