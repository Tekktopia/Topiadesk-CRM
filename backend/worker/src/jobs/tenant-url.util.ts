import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { loadEnv } from '@topiadesk/config';

/**
 * The origin a TENANT's users and clients actually reach.
 *
 * `env.APP_URL` is `https://<app label>.<root domain>` — a host no tenant
 * maps to, which returns 403 for everyone. Any link built from it and sent
 * to a real tenant's client (a portal sign-in link, a survey invite) is
 * therefore dead on arrival. The root domain is derived by stripping
 * APP_URL's own leftmost label (NOT a hardcoded `/^app\./` — see
 * keycloak-realm-provisioning.ts's tenantRootDomain() for the bug that
 * caused live, confirmed against a real deployment whose app label is
 * "tekktopia-app", not "app"), the same derivation tenants.controller.ts
 * uses, and the subdomain comes from the platform registry.
 *
 * Falls back to APP_URL only for a tenant with no subdomain (legacy rows) or
 * the seed tenant, which genuinely has nowhere else to go.
 */
export async function tenantBaseUrl(tenantSchema: string | null): Promise<string> {
  const env = loadEnv();
  if (!tenantSchema) return env.APP_URL;
  const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findFirst({ where: { schemaName: tenantSchema }, select: { subdomain: true } }),
  );
  if (!tenant?.subdomain) return env.APP_URL;
  const appHost = new URL(env.APP_URL).host;
  const root = appHost.split('.').slice(1).join('.') || appHost;
  return `https://${tenant.subdomain}.${root}`;
}
