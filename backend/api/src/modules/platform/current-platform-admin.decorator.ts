import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PlatformAdminContext } from './platform-context';

/** Usage: `list(@CurrentPlatformAdmin() admin: PlatformAdminContext)` — populated by PlatformContextMiddleware. */
export const CurrentPlatformAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): PlatformAdminContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.platformAdmin) {
    throw new Error('CurrentPlatformAdmin decorator used on a route not covered by PlatformContextMiddleware');
  }
  return req.platformAdmin;
});
