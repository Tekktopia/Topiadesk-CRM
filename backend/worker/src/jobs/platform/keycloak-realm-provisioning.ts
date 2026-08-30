import { loadEnv } from '@topiadesk/config';
import { masterFetch, safeBody } from '../../keycloak-master-client.util';

/**
 * Creates a Keycloak realm (+ CRM role set + a `topiadesk-web`-shaped
 * client) and a first ADMIN user for a newly-provisioned tenant — the
 * Keycloak-side half of backend/worker/src/jobs/platform/provision-tenant.job.ts,
 * mirrored against the Postgres-side half in @topiadesk/db's
 * applyTenantMigrations/applyTenantRlsAndTriggers.
 *
 * Deliberately NOT an extension of backend/api's KeycloakAdminService: that
 * service authenticates as a service-account client SCOPED TO the
 * "topiadesk" realm (manage-users/view-users only, within that one realm —
 * see its own header comment) — there is no service-account/client-
 * credentials path for creating whole REALMS in Keycloak; `POST
 * /admin/realms` requires real MASTER-realm admin credentials
 * (KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD, authenticated via the
 * `password` grant against Keycloak's built-in `admin-cli` client in the
 * `master` realm — confirmed empirically against the local Keycloak
 * instance). backend/worker has no NestJS DI container to hang an
 * `@Injectable()` service off, so this is a plain module-level token cache
 * + functions, matching every other file under jobs/.
 */

const TENANT_REALM_NAME_PATTERN = /^tenant_[a-z0-9_]+$/;

/**
 * The 4 CRM roles, verbatim from infra/keycloak/realm-export.json's own
 * `roles.realm` — kept as a literal copy (not imported: that file is a
 * static Keycloak import fixture, not a TS module) so a tenant realm's
 * role set matches the one the "topiadesk" realm already ships with,
 * ready for Phase 2 to point frontend/web at per-tenant realms with no
 * further Keycloak-side setup.
 */
const TENANT_REALM_ROLES = [
  { name: 'ADMIN', description: 'Full system access' },
  { name: 'MANAGER', description: 'Department head — sees and manages records within their department' },
  { name: 'ACCOUNT_HANDLER', description: 'Front-line broker — manages their own book of business' },
  { name: 'COMPLIANCE_OFFICER', description: 'Audit, approvals, and regulatory oversight' },
] as const;

/**
 * Root domain derived from APP_URL (e.g. `https://app.topiadesk.localhost`
 * -> `topiadesk.localhost`) — used only to shape this tenant's future web
 * client's redirect URI (`https://<slug>.<root>/*`). Wildcard subdomain
 * routing + real TLS for arbitrary tenant subdomains is Phase 2 work (see
 * the plan's "Explicitly deferred" list) — frontend/web cannot actually be
 * reached at this URL yet, but provisioning the client with its eventual
 * shape now means Phase 2 doesn't need to re-provision every existing
 * tenant's Keycloak client when it lands.
 */
function tenantRootDomain(): string {
  const env = loadEnv();
  // Strip only the app's OWN leftmost label, not a hardcoded "app." prefix
  // — this deployment's real APP_URL is https://tekktopia-app.topiadesk.com,
  // so /^app\./ never matched and every tenant provisioned since Phase 2's
  // wildcard subdomain routing went live got the WRONG root domain baked
  // into their Keycloak client's redirect URI
  // (<slug>.tekktopia-app.topiadesk.com instead of <slug>.topiadesk.com) —
  // confirmed live, a real tenant hit Keycloak's "Invalid parameter:
  // redirect_uri" as a direct result. See frontend/web/lib/auth/
  // tenant-realm.ts's identical fix for the full explanation.
  const appHost = new URL(env.APP_URL).host;
  return appHost.split('.').slice(1).join('.') || appHost;
}

/**
 * DNS hostname labels don't allow underscores (RFC 1123) — tenant slugs
 * do (matching the `tenant_<slug>` schema/realm naming convention, where
 * underscores are perfectly valid). Confirmed empirically: a Keycloak
 * client's redirectUris containing an underscore in the host causes every
 * authorization request against it to fail with `invalid_redirect_uri`
 * (Keycloak's own redirect_uri matcher rejects it outright, not just a
 * theoretical DNS concern). Hyphens are valid in both slugs and hostnames,
 * so this is a one-way, lossy-but-safe substitution for subdomain use only
 * — `opts.tenantSlug` itself (and the schema/realm names derived from it
 * elsewhere) are untouched.
 */
function slugToHostLabel(slug: string): string {
  return slug.replace(/_/g, '-');
}

export async function createTenantRealm(opts: { realmName: string; displayName: string; tenantSlug: string }): Promise<void> {
  if (!TENANT_REALM_NAME_PATTERN.test(opts.realmName)) {
    throw new Error(`Refusing to create Keycloak realm: "${opts.realmName}" is not a valid tenant realm name (expected /${TENANT_REALM_NAME_PATTERN.source}/).`);
  }
  const tenantWebOrigin = `https://${slugToHostLabel(opts.tenantSlug)}.${tenantRootDomain()}`;

  const res = await masterFetch('/admin/realms', {
    method: 'POST',
    body: JSON.stringify({
      realm: opts.realmName,
      enabled: true,
      displayName: opts.displayName,
      loginTheme: 'topiadesk',
      sslRequired: 'external',
      registrationAllowed: false,
      resetPasswordAllowed: true,
      editUsernameAllowed: false,
      bruteForceProtected: true,
      failureFactor: 5,
      waitIncrementSeconds: 60,
      maxFailureWaitSeconds: 900,
      // Persists LOGIN/LOGIN_ERROR (etc.) events so jobs/security-monitoring/
      // detect-anomalies.job.ts's admin-events poll has something to read —
      // a security-audit finding: bruteForceProtected above blocks a brute
      // force in progress, but nothing was watching for one at all before
      // this (no alert, no record). 30 days is enough for the job's own
      // 15-minute lookback window with room to spare for catching up after
      // any real downtime.
      eventsEnabled: true,
      eventsExpiration: 60 * 60 * 24 * 30,
      enabledEventTypes: ['LOGIN', 'LOGIN_ERROR'],
      adminEventsEnabled: false,
      passwordPolicy: 'length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and notUsername',
      otpPolicyType: 'totp',
      otpPolicyAlgorithm: 'HmacSHA1',
      otpPolicyDigits: 6,
      otpPolicyPeriod: 30,
      accessTokenLifespan: 900,
      ssoSessionIdleTimeout: 1800,
      ssoSessionMaxLifespan: 36000,
      revokeRefreshToken: true,
      refreshTokenMaxReuse: 0,
      roles: { realm: TENANT_REALM_ROLES },
      clients: [
        {
          clientId: 'topiadesk-web',
          name: 'TopiaDesk Web',
          protocol: 'openid-connect',
          publicClient: true,
          standardFlowEnabled: true,
          implicitFlowEnabled: false,
          directAccessGrantsEnabled: false,
          serviceAccountsEnabled: false,
          attributes: {
            'pkce.code.challenge.method': 'S256',
            'post.logout.redirect.uris': `${tenantWebOrigin}/*`,
          },
          redirectUris: [`${tenantWebOrigin}/*`],
          webOrigins: [tenantWebOrigin],
          // Without this, jwt-verifier.ts's audience check (added for the
          // security-audit "JWT audience never validated" finding) rejects
          // every token from this realm outright — see that config field's
          // own doc comment. `included.custom.audience`, NOT
          // `included.client.audience`: unlike the static "topiadesk"
          // realm (infra/keycloak/realm-export.json), a per-tenant realm
          // never gets its own `topiadesk-api` CLIENT (only `topiadesk-web`
          // above) — the API is one shared app across every tenant realm,
          // so this embeds the literal string instead of referencing a
          // client that doesn't exist here.
          protocolMappers: [
            {
              name: 'topiadesk-api-audience',
              protocol: 'openid-connect',
              protocolMapper: 'oidc-audience-mapper',
              consentRequired: false,
              config: {
                'included.custom.audience': 'topiadesk-api',
                'id.token.claim': 'false',
                'access.token.claim': 'true',
              },
            },
          ],
        },
      ],
    }),
  });
  if (res.status !== 201) {
    throw new Error(`Keycloak create-realm failed for "${opts.realmName}" (${res.status}): ${await safeBody(res)}`);
  }
}

export async function deleteTenantRealm(realmName: string): Promise<void> {
  if (!TENANT_REALM_NAME_PATTERN.test(realmName)) {
    throw new Error(`Refusing to delete Keycloak realm: "${realmName}" is not a valid tenant realm name.`);
  }
  const res = await masterFetch(`/admin/realms/${encodeURIComponent(realmName)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Keycloak delete-realm failed for "${realmName}" (${res.status}): ${await safeBody(res)}`);
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
}

function generateTemporaryPassword(): string {
  // Must satisfy the realm's own passwordPolicy above (12+ chars, upper/
  // lower/digit/special) — this is a one-time value the user is forced to
  // change via the UPDATE_PASSWORD required action below, never displayed
  // or logged, so its exact shape only matters for passing that policy
  // check at creation time.
  const random = Math.random().toString(36).slice(2, 10);
  return `Tdk!${random}A1`;
}

/**
 * Creates the tenant's first real user (in the tenant's own realm, not
 * "topiadesk-platform"), grants ADMIN, and returns credentials for the
 * invite email. Role assignment is a SEPARATE call after creation —
 * confirmed empirically against the local Keycloak instance that
 * UserRepresentation's inline `realmRoles` field on `POST .../users` is
 * silently ignored (the created user ends up with only the realm's
 * `default-roles-<realm>` composite, no ADMIN); `POST .../role-mappings/
 * realm` with the role's own representation is the call that actually
 * works.
 */
export async function createTenantAdminUser(opts: {
  realmName: string;
  email: string;
  fullName: string;
  /** When set, used as the account's real password (permanent, no forced
   * change) instead of a generated one-time value — the caller (a
   * platform admin) is deliberately choosing it, e.g. to hand off login
   * immediately without waiting on email delivery. MFA setup
   * (CONFIGURE_TOTP) is still required either way. */
  password?: string;
}): Promise<{ keycloakSubjectId: string; temporaryPassword: string }> {
  if (!TENANT_REALM_NAME_PATTERN.test(opts.realmName)) {
    throw new Error(`Refusing to create user in Keycloak realm: "${opts.realmName}" is not a valid tenant realm name.`);
  }
  const { firstName, lastName } = splitName(opts.fullName);
  const isManualPassword = !!opts.password;
  const temporaryPassword = opts.password ?? generateTemporaryPassword();

  const createRes = await masterFetch(`/admin/realms/${encodeURIComponent(opts.realmName)}/users`, {
    method: 'POST',
    body: JSON.stringify({
      username: opts.email,
      email: opts.email,
      emailVerified: true,
      enabled: true,
      firstName,
      lastName,
      credentials: [{ type: 'password', value: temporaryPassword, temporary: !isManualPassword }],
      requiredActions: isManualPassword ? ['CONFIGURE_TOTP'] : ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    }),
  });
  if (createRes.status !== 201) {
    throw new Error(`Keycloak create-tenant-admin-user failed for "${opts.realmName}"/"${opts.email}" (${createRes.status}): ${await safeBody(createRes)}`);
  }
  const location = createRes.headers.get('location');
  const keycloakSubjectId = location?.split('/').pop();
  if (!keycloakSubjectId) {
    throw new Error(`Keycloak create-tenant-admin-user succeeded but returned no Location header for "${opts.realmName}"/"${opts.email}"`);
  }

  const roleRes = await masterFetch(`/admin/realms/${encodeURIComponent(opts.realmName)}/roles/ADMIN`, { method: 'GET' });
  if (!roleRes.ok) {
    throw new Error(`Keycloak get-role(ADMIN) failed for "${opts.realmName}" (${roleRes.status}): ${await safeBody(roleRes)}`);
  }
  const adminRole = await roleRes.json();

  const assignRes = await masterFetch(`/admin/realms/${encodeURIComponent(opts.realmName)}/users/${keycloakSubjectId}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify([adminRole]),
  });
  if (!assignRes.ok) {
    throw new Error(`Keycloak assign-role(ADMIN) failed for "${opts.realmName}"/"${opts.email}" (${assignRes.status}): ${await safeBody(assignRes)}`);
  }

  return { keycloakSubjectId, temporaryPassword };
}

/**
 * Sibling to createTenantAdminUser() above, for the SAME reason this whole
 * file is separate from backend/api's KeycloakAdminService (master-realm
 * credentials, no per-realm service account) — but targets the fixed
 * "topiadesk-platform" realm (env.KEYCLOAK_PLATFORM_REALM) and grants
 * PLATFORM_ADMIN instead of ADMIN. Not a parameter on createTenantAdminUser
 * itself: that function's TENANT_REALM_NAME_PATTERN guard would reject
 * "topiadesk-platform" outright (it doesn't match `tenant_...`), and the
 * role-to-grant differs too — cleaner as its own small function than an
 * escape hatch bolted onto the tenant-specific one.
 */
export async function createPlatformAdminKeycloakUser(opts: {
  platformRealm: string;
  email: string;
  fullName: string;
}): Promise<{ keycloakSubjectId: string; temporaryPassword: string }> {
  const { firstName, lastName } = splitName(opts.fullName);
  const temporaryPassword = generateTemporaryPassword();

  const createRes = await masterFetch(`/admin/realms/${encodeURIComponent(opts.platformRealm)}/users`, {
    method: 'POST',
    body: JSON.stringify({
      username: opts.email,
      email: opts.email,
      emailVerified: true,
      enabled: true,
      firstName,
      lastName,
      credentials: [{ type: 'password', value: temporaryPassword, temporary: true }],
      requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    }),
  });
  if (createRes.status !== 201) {
    throw new Error(`Keycloak create-platform-admin-user failed for "${opts.email}" (${createRes.status}): ${await safeBody(createRes)}`);
  }
  const location = createRes.headers.get('location');
  const keycloakSubjectId = location?.split('/').pop();
  if (!keycloakSubjectId) {
    throw new Error(`Keycloak create-platform-admin-user succeeded but returned no Location header for "${opts.email}"`);
  }

  const roleRes = await masterFetch(`/admin/realms/${encodeURIComponent(opts.platformRealm)}/roles/PLATFORM_ADMIN`, { method: 'GET' });
  if (!roleRes.ok) {
    throw new Error(`Keycloak get-role(PLATFORM_ADMIN) failed (${roleRes.status}): ${await safeBody(roleRes)}`);
  }
  const platformAdminRole = await roleRes.json();

  const assignRes = await masterFetch(`/admin/realms/${encodeURIComponent(opts.platformRealm)}/users/${keycloakSubjectId}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify([platformAdminRole]),
  });
  if (!assignRes.ok) {
    throw new Error(`Keycloak assign-role(PLATFORM_ADMIN) failed for "${opts.email}" (${assignRes.status}): ${await safeBody(assignRes)}`);
  }

  return { keycloakSubjectId, temporaryPassword };
}
