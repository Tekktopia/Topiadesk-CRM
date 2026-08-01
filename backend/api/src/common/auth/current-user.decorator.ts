import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

/** Usage: `findMine(@CurrentUser() user: AuthenticatedUser)` — populated by RlsContextMiddleware. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.user) {
    throw new Error('CurrentUser decorator used on a route not covered by RlsContextMiddleware');
  }
  return req.user;
});
