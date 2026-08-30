import 'server-only';
import { getWebEnv } from '../env';

/**
 * Resolves which Keycloak realm a request's Host header belongs to —
 * `app.<root>` (or the bare root/localhost, for standalone dev) is the
 * default/legacy single-tenant path (today's exact behavior, unchanged);
 * any other subdomain of the root domain is looked up against
 * `GET /public/tenant-lookup` (backend/api's
 * public-tenant-lookup.controller.ts), which only resolves an ACTIVE
 * tenant's subdomain to its realm.
 *
 * Deliberately DB-backed rather than a pure string-convention inversion
 * (`tenant_${label.replace(/-/g,'_')}`) — a convention-only approach would
 * silently break for any tenant whose `keycloakRealm` doesn't follow the
 * `tenant_<slug>` convention (exactly the situation for the one legacy
 * tenant that predates schema-per-tenant provisioning, whose realm is
 * literally `topiadesk` — the default realm), and has no way to fail
 * closed for a PROVISIONING/SUSPENDED tenant before ever reaching
 * Keycloak. Fails safe to the default realm on any lookup miss/error —
 * an unrecognized or inactive subdomain should look like "not a tenant",
 * never a 500.
 */
export async function realmForHost(host: string): Promise<string> {
  const env = getWebEnv();
  // Strip only the app's OWN leftmost label, whatever it actually is — NOT
  // a hardcoded "app." prefix. Real deployments don't all name it "app.":
  // this one's APP_URL is https://tekktopia-app.topiadesk.com, so a literal
  // /^app\./ strip never matched, root stayed "tekktopia-app.topiadesk.com",
  // and every real tenant subdomain (cribxpert., boltspeed-broadband-
  // networks., ...) failed the endsWith(root) check below and silently
  // fell back to the default realm — confirmed live: a real tenant hit
  // Keycloak's "Invalid parameter: redirect_uri" because the DEFAULT
  // realm's client has no reason to know that tenant's redirect URI.
  const appHost = new URL(env.APP_URL).host;
  const root = appHost.split('.').slice(1).join('.') || appHost;
  const bareHost = host.split(':')[0] ?? '';

  if (bareHost === appHost || bareHost === root || !bareHost.endsWith(`.${root}`)) {
    return env.KEYCLOAK_REALM;
  }

  const label = bareHost.slice(0, -(root.length + 1));
  try {
    const apiBase = env.API_INTERNAL_URL ?? env.API_URL;
    const res = await fetch(`${apiBase}/public/tenant-lookup?subdomain=${encodeURIComponent(label)}`);
    if (!res.ok) return env.KEYCLOAK_REALM;
    const body = (await res.json()) as { keycloakRealm?: string };
    return body.keycloakRealm ?? env.KEYCLOAK_REALM;
  } catch (err) {
    console.error(`[tenant-realm] lookup failed for subdomain "${label}", falling back to default realm:`, err);
    return env.KEYCLOAK_REALM;
  }
}
