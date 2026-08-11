import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type RlsContext } from '@topiadesk/db';
import { ENV_TOKEN, type Env } from '../config/config.module';
import { JwtVerifier } from './jwt-verifier';
import { resolveActiveTenantByRealm } from './tenant-realm-resolver';
import { hashApiKey } from '../../modules/identity/api-key.util';
import type { AuthenticatedUser } from './authenticated-user';

const API_KEY_PREFIX = 'tdk_';

/**
 * Runs before Nest's guard/interceptor chain (middleware executes first in
 * the request lifecycle) so that everything downstream — guards,
 * interceptors, controllers, and every Prisma call they make — runs inside
 * one bound RLS AsyncLocalStorage context. This is deliberately plain
 * Express middleware wrapping `next()` in `runWithRlsContext`, not a Nest
 * interceptor wrapping the RxJS `next.handle()` observable: middleware
 * guarantees the entire downstream call chain (routing, guards, controller,
 * every await inside it) originates synchronously from within this
 * function's call stack, which is exactly Node's AsyncLocalStorage
 * propagation guarantee. An interceptor-based approach was considered and
 * rejected — see packages/db/src/client.ts's header comment for the sibling
 * lesson learned about not trusting an approach that "should" work without
 * testing it against real concurrent requests.
 *
 * MULTI-REALM (Phase 2a) — the token's issuer is no longer assumed to be
 * one fixed realm. Sequence, deliberately in this order:
 *  1. `jwt.decode()` (UNVERIFIED — no signature check yet) just to read
 *     `iss` and learn which realm issued this token, so step 2 knows which
 *     realm's JWKS to check the signature against. Nothing learned here is
 *     trusted past this point.
 *  2. Verify the signature for real, against that realm's JWKS (cached per
 *     realm in `verifiersByRealm` — this class is a singleton Nest
 *     provider, so the cache persists for the process's lifetime, same
 *     "construct once, reuse" shape jwks-rsa's own client already has
 *     internally). Failure -> 401 ("I don't believe this token").
 *  3. ONLY once the token is cryptographically proven valid, look up which
 *     `Tenant` this realm belongs to and whether it's ACTIVE
 *     (`resolveActiveTenantByRealm`, Redis-cached ~30s, fails open to a
 *     direct platform-schema read). No match, or not ACTIVE -> 403 ("valid
 *     token, but not allowed") — this check IS the live suspension
 *     enforcement; there is no separate sync job, it's just checked fresh
 *     (mod the cache window) on every request.
 *  4. Bind `tenantSchema` into both the bootstrap lookup's context (spread-
 *     overriding SYSTEM_JOB_CONTEXT — the one deliberate override of that
 *     otherwise-bare constant) and the real per-request RlsContext, so
 *     `getPrismaClient()` transparently resolves every downstream query
 *     against the right tenant schema with zero changes to any controller.
 *
 * Deciding tenant/suspension status from the UNVERIFIED issuer (before
 * step 2) was considered and rejected — that would make an access decision
 * from attacker-controlled input before any cryptographic proof it's real.
 *
 * `/health`, `/api/docs*`, and Keycloak's own callback routes are excluded
 * from this middleware in app.module.ts's MiddlewareConsumer config.
 */
@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  private readonly verifiersByRealm = new Map<string, JwtVerifier>();

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  private verifierForRealm(realmName: string): JwtVerifier {
    let verifier = this.verifiersByRealm.get(realmName);
    if (!verifier) {
      // Derived by plain string substitution — confirmed these reproduce
      // today's hardcoded KEYCLOAK_ISSUER_URL/KEYCLOAK_JWKS_URI exactly
      // when realmName === env.KEYCLOAK_REALM (`.env`'s own values are
      // literally `${KEYCLOAK_URL}/realms/${realm}` and
      // `${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/certs`).
      // No DB call needed for this step — only resolveActiveTenantByRealm
      // below needs one.
      const base = this.env.KEYCLOAK_URL;
      verifier = new JwtVerifier({
        jwksUri: `${base}/realms/${realmName}/protocol/openid-connect/certs`,
        issuerUrl: `${base}/realms/${realmName}`,
        internalUrl: this.env.KEYCLOAK_INTERNAL_URL,
      });
      this.verifiersByRealm.set(realmName, verifier);
    }
    return verifier;
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ statusCode: 401, message: 'Missing bearer token' });
      return;
    }
    const token = authHeader.slice('Bearer '.length);

    // Self-service API keys (see api-keys.controller.ts) authenticate via
    // this completely separate branch — a `tdk_`-prefixed bearer token can
    // never be mistaken for a real Keycloak JWT (those are three
    // dot-separated base64url segments starting `eyJ`), so this check is
    // unambiguous and every existing JWT request falls through to the
    // unmodified code below exactly as before.
    if (token.startsWith(API_KEY_PREFIX)) {
      await this.useApiKey(token, req, res, next);
      return;
    }

    const unverified = jwt.decode(token);
    const iss = unverified && typeof unverified === 'object' ? (unverified as { iss?: unknown }).iss : undefined;
    const realmMatch = typeof iss === 'string' ? iss.match(/\/realms\/([^/]+)$/) : null;
    if (!realmMatch) {
      res.status(401).json({ statusCode: 401, message: 'Invalid or expired token' });
      return;
    }
    const realmName = realmMatch[1]!;

    let claims;
    try {
      claims = await this.verifierForRealm(realmName).verify(token);
    } catch {
      res.status(401).json({ statusCode: 401, message: 'Invalid or expired token' });
      return;
    }

    const resolvedTenant = await resolveActiveTenantByRealm(realmName);
    if (!resolvedTenant || resolvedTenant.status !== 'ACTIVE') {
      res.status(403).json({ statusCode: 403, message: 'This organization is not currently active' });
      return;
    }
    const tenantSchema = resolvedTenant.schemaName;

    // roles/departments/branches still carry no RLS policy — but `users`
    // now does (identity-enterprise pass: delegated admin scoping, see
    // users_rw in prisma/rls/002_policies.sql), so this bootstrap lookup —
    // which necessarily runs before ANY real RlsContext can be bound, since
    // it's what DERIVES that context — must explicitly bypass RLS itself
    // rather than relying on the (now false) assumption that this table is
    // unprotected. Without this, users_rw's USING clause evaluates against
    // no bound session variables at all (app_current_user_id() is NULL),
    // which resolves to `false` for every row — every login would 403 with
    // "No active local account", not just this one caller.
    const prisma = getPrismaClient();
    const localUser = await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, () =>
      prisma.user.findUnique({
        where: { keycloakSubjectId: claims.sub },
        include: { roles: { include: { role: true } } },
      }),
    );

    if (!localUser || localUser.status !== 'ACTIVE') {
      res.status(403).json({ statusCode: 403, message: 'No active local account for this identity' });
      return;
    }

    const roleNames = localUser.roles.map((r: { role: { name: string } }) => r.role.name);
    const roleIds = localUser.roles.map((r: { role: { id: string } }) => r.role.id);
    const authenticatedUser: AuthenticatedUser = {
      id: localUser.id,
      email: localUser.email,
      fullName: localUser.fullName,
      presenceStatus: localUser.presenceStatus,
      roles: roleNames,
      roleIds,
      departmentId: localUser.departmentId,
      branchId: localUser.branchId,
    };
    req.user = authenticatedUser;

    const ctx: RlsContext = {
      userId: localUser.id,
      role: roleNames.includes('ADMIN') ? 'ADMIN' : 'USER',
      departmentId: localUser.departmentId,
      branchId: localUser.branchId,
      clientIp: req.ip ?? null,
      tenantSchema,
      // The JWT's own verified issuer — the real Keycloak realm this
      // request authenticated against, not assumed from tenantSchema (see
      // RlsContext.keycloakRealm's own comment for why that assumption
      // broke for the original pre-multi-tenant seed tenant).
      keycloakRealm: realmName,
    };

    runWithRlsContext(ctx, () => next());
  }

  /**
   * Self-service API key auth (see ApiKey's schema.prisma comment) — an
   * intentional mirror of the JWT branch above's bootstrap-lookup/context-
   * build shape, just sourcing `tenantSchema`/the local user differently:
   * the key row itself (always in `public`, looked up under
   * SYSTEM_JOB_CONTEXT) names the tenant, then that tenant's own User row
   * is fetched live — so permissions always reflect the user's CURRENT
   * roles/department/branch, never a snapshot frozen at key-creation time.
   */
  private async useApiKey(token: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    const prisma = getPrismaClient();
    const tokenHash = hashApiKey(token);
    const apiKey = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () => prisma.apiKey.findUnique({ where: { tokenHash } }));
    if (!apiKey || !apiKey.isActive || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
      res.status(401).json({ statusCode: 401, message: 'Invalid or expired API key' });
      return;
    }

    const tenantSchema = apiKey.tenantSchema;
    const localUser = await runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, () =>
      prisma.user.findUnique({
        where: { id: apiKey.userId },
        include: { roles: { include: { role: true } } },
      }),
    );
    if (!localUser || localUser.status !== 'ACTIVE') {
      res.status(403).json({ statusCode: 403, message: 'No active local account for this API key' });
      return;
    }

    // Best-effort, doesn't block the request — same fire-and-forget shape
    // as ScimAuthGuard's own lastUsedAt bookkeeping.
    runWithRlsContext(SYSTEM_JOB_CONTEXT, () => prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })).catch(() => {});

    const roleNames = localUser.roles.map((r: { role: { name: string } }) => r.role.name);
    const roleIds = localUser.roles.map((r: { role: { id: string } }) => r.role.id);
    const authenticatedUser: AuthenticatedUser = {
      id: localUser.id,
      email: localUser.email,
      fullName: localUser.fullName,
      presenceStatus: localUser.presenceStatus,
      roles: roleNames,
      roleIds,
      departmentId: localUser.departmentId,
      branchId: localUser.branchId,
    };
    req.user = authenticatedUser;

    const ctx: RlsContext = {
      userId: localUser.id,
      role: roleNames.includes('ADMIN') ? 'ADMIN' : 'USER',
      departmentId: localUser.departmentId,
      branchId: localUser.branchId,
      clientIp: req.ip ?? null,
      tenantSchema,
      // No real Keycloak realm behind an API-key request — left null,
      // same documented fallback (tenantSchema, then env.KEYCLOAK_REALM)
      // KeycloakAdminService.realmName() already has for exactly this case.
      keycloakRealm: null,
    };

    runWithRlsContext(ctx, () => next());
  }
}
