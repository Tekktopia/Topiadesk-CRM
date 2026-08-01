import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getPrismaClient, runWithRlsContext, type RlsContext } from '@topiadesk/db';
import { ENV_TOKEN, type Env } from '../config/config.module';
import { JwtVerifier } from './jwt-verifier';
import type { AuthenticatedUser } from './authenticated-user';

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
 * `/health`, `/api/docs*`, and Keycloak's own callback routes are excluded
 * from this middleware in app.module.ts's MiddlewareConsumer config.
 */
@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  private readonly verifier: JwtVerifier;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {
    this.verifier = new JwtVerifier(env);
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

    // users/roles/departments/branches carry no RLS policy (org-wide
    // reference data) — safe to query with no bound context yet.
    const prisma = getPrismaClient();
    const localUser = await prisma.user.findUnique({
      where: { keycloakSubjectId: claims.sub },
      include: { roles: { include: { role: true } } },
    });

    if (!localUser || localUser.status !== 'ACTIVE') {
      res.status(403).json({ statusCode: 403, message: 'No active local account for this identity' });
      return;
    }

    const roleNames = localUser.roles.map((r: { role: { name: string } }) => r.role.name);
    const authenticatedUser: AuthenticatedUser = {
      id: localUser.id,
      email: localUser.email,
      fullName: localUser.fullName,
      roles: roleNames,
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
    };

    runWithRlsContext(ctx, () => next());
  }
}
