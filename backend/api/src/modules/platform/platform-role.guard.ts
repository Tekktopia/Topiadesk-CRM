import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
// NOT a type-only import: Reflector is constructor-injected below — see
// backend/api/src/common/auth/permission.guard.ts's identical comment for
// why `import type` here breaks Nest's DI resolution at boot.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_PLATFORM_ROLE_KEY } from './require-platform-role.decorator';

const ROLE_RANK: Record<'SUPPORT' | 'SUPER_ADMIN', number> = { SUPPORT: 0, SUPER_ADMIN: 1 };

/**
 * Second, independent layer on top of PlatformContextMiddleware — that
 * middleware answers "is this a legitimate active platform admin at all"
 * (and already populates req.platformAdmin.role, no extra query here);
 * this guard answers "is their tier high enough for this specific
 * action". No metadata (@RequirePlatformRole not applied to the route) →
 * pass through, matching PermissionGuard's identical no-metadata
 * behavior — most platform endpoints (all GETs, tenant-user support
 * operations, ticket handling) are intentionally left ungated.
 */
@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<'SUPPORT' | 'SUPER_ADMIN' | undefined>(REQUIRE_PLATFORM_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const admin = context.switchToHttp().getRequest<Request>().platformAdmin;
    if (!admin) throw new ForbiddenException('No authenticated platform-admin session');
    if (ROLE_RANK[admin.role] < ROLE_RANK[required]) {
      throw new ForbiddenException(`Requires platform-admin role "${required}" or higher`);
    }
    return true;
  }
}
