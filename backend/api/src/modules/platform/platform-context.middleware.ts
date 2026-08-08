import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT, type RlsContext } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import { JwtVerifier } from '../../common/auth/jwt-verifier';
import './platform-context';

/**
 * The Platform-Admin API's equivalent of RlsContextMiddleware — verifies a
 * bearer token issued by the SEPARATE "topiadesk-platform" Keycloak realm
 * (never the tenant "topiadesk" one; RlsContextMiddleware is explicitly
 * excluded from `platform/*` in app.module.ts), looks up the matching
 * PlatformAdminUser row, and binds an RlsContext for
 * @topiadesk/db-platform's RLS (`platform_current_user_id() IS NOT NULL`
 * — see packages/db-platform/prisma/rls/002_policies.sql). Reuses
 * @topiadesk/db's RlsContext type/AsyncLocalStorage rather than a third
 * one — see packages/db-platform/src/client.ts's header comment for why
 * that sharing is safe (a request only ever touches one of {tenant schema,
 * platform schema}).
 *
 * No PermissionGuard-equivalent here: Phase 1's platform RLS is
 * deliberately coarse ("any authenticated platform-admin session, no
 * OWN/DEPARTMENT/BRANCH tiering" — see the plan's own scoping decision),
 * so any PlatformAdminUser with status ACTIVE can operate on any
 * `/platform/*` endpoint.
 */
@Injectable()
export class PlatformContextMiddleware implements NestMiddleware {
  private readonly verifier: JwtVerifier;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    this.verifier = new JwtVerifier({
      jwksUri: env.KEYCLOAK_PLATFORM_JWKS_URI,
      issuerUrl: env.KEYCLOAK_PLATFORM_ISSUER_URL,
      internalUrl: env.KEYCLOAK_INTERNAL_URL,
    });
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ statusCode: 401, message: 'Missing bearer token' });
      return;
    }

    let claims;
    try {
      claims = await this.verifier.verify(authHeader.slice('Bearer '.length));
    } catch {
      res.status(401).json({ statusCode: 401, message: 'Invalid or expired token' });
      return;
    }

    const platformPrisma = getPlatformPrismaClient();
    // Bootstrap lookup (deriving the real context from the token) runs
    // under SYSTEM_JOB_CONTEXT, same reasoning as RlsContextMiddleware's
    // identical bootstrap step: no real RlsContext can be bound yet since
    // this IS what derives it.
    const admin = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      platformPrisma.platformAdminUser.findUnique({ where: { keycloakSubjectId: claims.sub } }),
    );

    if (!admin || admin.status !== 'ACTIVE') {
      res.status(403).json({ statusCode: 403, message: 'No active platform-admin account for this identity' });
      return;
    }

    req.platformAdmin = { id: admin.id, email: admin.email, fullName: admin.fullName };

    // tenantSchema: null — a platform-admin session never touches a tenant
    // schema at all (only getPlatformPrismaClient(), which doesn't read
    // this field — see packages/db-platform/src/client.ts).
    const ctx: RlsContext = { userId: admin.id, role: 'PLATFORM_ADMIN', departmentId: null, branchId: null, clientIp: req.ip ?? null, tenantSchema: null };
    runWithRlsContext(ctx, () => next());
  }
}
