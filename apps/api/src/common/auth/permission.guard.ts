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
import { REQUIRE_PERMISSION_KEY, type RequiredPermission } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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
      throw new ForbiddenException(`Missing permission: ${required.resource}:${required.action}`);
    }
    return true;
  }
}
