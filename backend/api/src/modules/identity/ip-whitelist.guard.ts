import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
// `ipaddr.js` is a plain CommonJS `export =` module (no esModuleInterop in
// this tsconfig — see backend/api/tsconfig.json) — `import * as` is the
// interop-safe form; a default import here would compile but resolve to
// `undefined` at runtime (there's no actual `.default` property on a CJS
// export like this one).
import * as ipaddr from 'ipaddr.js';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import { getActiveIpWhitelistEntries } from './ip-whitelist-cache';

/**
 * Enforcement layer for the ALREADY-EXISTING IpWhitelistEntry CRUD API —
 * ip-whitelist.controller.ts's own header comment explicitly flagged
 * enforcement as the missing piece ("Building that middleware is out of
 * scope here per the task brief" — that task brief is this one). Gated by
 * IP_WHITELIST_ENFORCED (existing env flag, already documented in
 * .env.example) so it's a no-op until an operator opts in.
 *
 * MUST run as a GLOBAL guard (APP_GUARD in app.module.ts's `providers`,
 * same mechanism ThrottlerGuard already uses there), not route-specific
 * `@UseGuards` — and must run AFTER RlsContextMiddleware, since it reads
 * `req.user.roleIds` (added to AuthenticatedUser specifically for this —
 * see authenticated-user.ts). Nest's guard phase always executes after
 * Express middleware in the request lifecycle, so simply adding
 * `{ provide: APP_GUARD, useClass: IpWhitelistGuard }` to app.module.ts is
 * sufficient — no MiddlewareConsumer wiring needed. Not made here since
 * app.module.ts is off-limits for this agent; exact snippet is in this
 * module's final report.
 *
 * Unauthenticated routes (health, SCIM, inbound/outbound webhooks, the
 * OAuth callback, the Keycloak sync webhook, ...) never populate req.user
 * (excluded from RlsContextMiddleware) and are independently secured by
 * their own guards — this guard is a deliberate no-op for them, IP
 * whitelisting only ever applies to an authenticated TopiaDesk user session.
 */
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.env.IP_WHITELIST_ENFORCED) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) return true;

    const clientIp = req.ip;
    if (!clientIp) throw new ForbiddenException('Unable to determine client IP address');

    const entries = await getActiveIpWhitelistEntries();
    if (entries.length === 0) {
      // Zero entries configured at all: enforcing against an empty list
      // would lock out every single user the instant IP_WHITELIST_ENFORCED
      // flips true, before an admin has entered even one range. Fail open
      // specifically for "nothing configured yet", not for "checked and
      // genuinely nothing matched" (handled below).
      return true;
    }

    const relevant = entries.filter((entry) => entry.appliesToRoleId === null || req.user!.roleIds.includes(entry.appliesToRoleId));
    if (relevant.length === 0) return true; // no active rule targets any role this caller holds

    let requesterAddr: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      requesterAddr = ipaddr.process(clientIp);
    } catch {
      throw new ForbiddenException('Unable to parse client IP address');
    }

    const isWhitelisted = relevant.some((entry) => {
      try {
        const cidr = ipaddr.parseCIDR(entry.cidrRange);
        // ipaddr.js's `.match()` overloads are per-class (IPv4/IPv6), so a
        // union-typed `requesterAddr` can't call it directly against a
        // union-typed cidr tuple — narrow explicitly on kind() (also
        // required at runtime: mixing families throws inside ipaddr.js
        // rather than returning false).
        if (requesterAddr.kind() !== cidr[0].kind()) return false;
        return requesterAddr.kind() === 'ipv4'
          ? (requesterAddr as ipaddr.IPv4).match(cidr as [ipaddr.IPv4, number])
          : (requesterAddr as ipaddr.IPv6).match(cidr as [ipaddr.IPv6, number]);
      } catch {
        // A malformed stored CIDR must never itself 403 every request —
        // treat as a non-match for that one entry, not a crash.
        return false;
      }
    });

    if (!isWhitelisted) {
      throw new ForbiddenException(`IP address ${clientIp} is not on the whitelist for your role`);
    }
    return true;
  }
}
