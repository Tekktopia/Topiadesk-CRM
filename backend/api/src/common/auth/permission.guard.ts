import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
// NOT a type-only import: Reflector is constructor-injected below, and Nest's
// DI resolves constructor parameter types via emitDecoratorMetadata's
// design:paramtypes, which needs the real class reference at runtime —
// `import type` erases it, causing "Nest can't resolve dependencies... the
// argument Function at index [0]" at boot (the DI system sees an untyped
// generic Function instead of Reflector and can't match it to a provider).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getPrismaClient } from '@topiadesk/db';
import { AuditService } from '../audit/audit.service';
import { REQUIRE_PERMISSION_KEY, type RequiredPermission } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // no @RequirePermission on this route — authentication alone suffices

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) throw new ForbiddenException('No authenticated user on request');
    if (user.roles.includes('ADMIN')) return true;

    const prisma = getPrismaClient();
    const grantCount = await prisma.rolePermission.count({
      where: {
        role: { users: { some: { userId: user.id } } },
        permission: { resource: required.resource, action: required.action },
      },
    });

    if (grantCount === 0) {
      // Fire-and-forget — a security-monitoring signal (feeds
      // backend/worker's detect-anomalies.job.ts permission-denied-burst
      // check), never allowed to fail or slow down the 403 response
      // itself. This is a COARSE "zero grant at any scope" denial only —
      // the far more common RLS-driven scope narrowing (has a grant, but
      // not for this specific row) never reaches here at all, so this
      // signal is a real "this caller has no business anywhere near this
      // resource" indicator, not routine day-to-day access-shaping noise.
      // entityId is a uuid column — no real "entity" exists for a coarse
      // permission check, so this uses the denied user's own id (also
      // available as actorUserId, but entityId is what audit-log.
      // controller.ts's list/filter UI actually indexes on).
      this.auditService
        .recordEvent({
          action: 'ACCESS_DENIED',
          entityType: 'permission',
          entityId: user.id,
          changedFields: { resource: required.resource, action: required.action, path: req.originalUrl, method: req.method },
        })
        .catch(() => undefined);
      throw new ForbiddenException(`Missing permission: ${required.resource}:${required.action}`);
    }
    return true;
  }
}
