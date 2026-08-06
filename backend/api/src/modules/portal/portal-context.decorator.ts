import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PortalContext } from './portal-context';

/** Usage: `list(@CurrentPortalContext() ctx: PortalContext)` — populated by PortalContextMiddleware. */
export const CurrentPortalContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): PortalContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.portalContext) {
    throw new Error('CurrentPortalContext decorator used on a route not covered by PortalContextMiddleware');
  }
  return req.portalContext;
});
