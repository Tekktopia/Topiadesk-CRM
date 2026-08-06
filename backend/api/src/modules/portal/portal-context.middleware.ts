import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { hashPortalToken } from './portal-token.util';
import './portal-context';

/**
 * The portal's equivalent of RlsContextMiddleware — runs before Nest's
 * guard chain, same "middleware guarantees the whole downstream call chain
 * originates from this function's synchronous call stack" reasoning that
 * file's own header comment documents (an interceptor/guard was
 * specifically rejected there for NOT reliably propagating
 * AsyncLocalStorage through Nest's RxJS pipeline — this mirrors that
 * lesson rather than re-learning it).
 *
 * Applied ONLY to `portal/*` routes EXCEPT `portal/auth/*`
 * (app.module.ts's MiddlewareConsumer config) — a portal visitor has no
 * session yet when requesting/consuming a login link. Every portal route
 * this guards runs the rest of the request under SYSTEM_JOB_CONTEXT (RLS
 * bypassed, same as public-knowledge.controller.ts) — the resolved
 * `req.portalContext.accountId` is the ONLY thing standing between this
 * middleware and leaking cross-account data; every portal.controller.ts
 * handler MUST filter explicitly by it, never rely on RLS to narrow
 * anything under this context.
 */
@Injectable()
export class PortalContextMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.headers['x-portal-session-token'];
    if (typeof token !== 'string' || token.length === 0) {
      res.status(401).json({ statusCode: 401, message: 'Missing portal session token' });
      return;
    }

    const tokenHash = hashPortalToken(token);
    const session = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().portalSession.findUnique({
        where: { tokenHash },
        include: { contact: { select: { id: true, accountId: true } } },
      }),
    );

    if (!session || session.expiresAt < new Date() || !session.contact.accountId) {
      res.status(401).json({ statusCode: 401, message: 'Invalid or expired portal session' });
      return;
    }

    req.portalContext = { contactId: session.contactId, accountId: session.contact.accountId };

    // Fire-and-forget — a failed lastSeenAt bump must never block/fail the
    // actual request, same "additive, not load-bearing" reasoning as every
    // other best-effort side effect in this codebase.
    runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().portalSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }),
    ).catch((err: unknown) => console.error('[portal] failed to bump lastSeenAt', err));

    runWithRlsContext(SYSTEM_JOB_CONTEXT, () => next());
  }
}
