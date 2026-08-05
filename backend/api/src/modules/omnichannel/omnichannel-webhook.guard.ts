import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '@topiadesk/config';

const WEBHOOK_SECRET_HEADER = 'x-omnichannel-webhook-secret';

/**
 * Shared-secret check for the inbound-channel webhook routes
 * (public/webhooks/inbound-email|whatsapp|sms) — mirrors
 * campaigns/campaign-webhook.guard.ts exactly. The caller is an email/
 * WhatsApp/SMS provider (or, in this environment, a manually-curled
 * simulation of one — there's no live Twilio/Meta/SendGrid account wired
 * up here), not a TopiaDesk user, so PermissionGuard doesn't apply.
 * OMNICHANNEL_WEBHOOK_SECRET is a required field in packages/config's
 * zod-validated Env, so a missing secret fails the whole app at boot
 * rather than at first webhook call.
 *
 * Honest limitation: this is a shared-secret header check, not full
 * provider request-signature verification (e.g. Twilio's HMAC-SHA1
 * X-Twilio-Signature scheme) — the production-correct approach once a real
 * provider account exists, not implemented here since there's nothing to
 * verify against in this environment.
 */
@Injectable()
export class OmnichannelWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { OMNICHANNEL_WEBHOOK_SECRET } = loadEnv();
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers[WEBHOOK_SECRET_HEADER];
    if (provided !== OMNICHANNEL_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }
    return true;
  }
}
