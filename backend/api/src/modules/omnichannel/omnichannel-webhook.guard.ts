import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '@topiadesk/config';
import { verifyTwilioSignature } from '../../common/webhooks/twilio-signature.util';

const WEBHOOK_SECRET_HEADER = 'x-omnichannel-webhook-secret';
const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';

/**
 * Shared-secret check for the inbound-channel webhook routes
 * (public/webhooks/inbound-email|whatsapp|sms) — mirrors
 * campaigns/campaign-webhook.guard.ts. The caller is an email/WhatsApp/SMS
 * provider (or, in this environment, a manually-curled simulation of
 * one), not a TopiaDesk user, so PermissionGuard doesn't apply.
 * OMNICHANNEL_WEBHOOK_SECRET is a required field in packages/config's
 * zod-validated Env, so a missing secret fails the whole app at boot
 * rather than at first webhook call.
 *
 * TWILIO_AUTH_TOKEN (optional) layers real X-Twilio-Signature HMAC-SHA1
 * verification (common/webhooks/twilio-signature.util.ts) on top when
 * set — full provider request-signature verification, not just the
 * shared-secret header, for the WhatsApp/SMS routes specifically
 * (Twilio-shaped payloads, see inbound-messaging.controller.ts's own
 * header comment). Unset in dev (nothing real to verify against); the
 * shared-secret check alone still gates access either way, this is
 * additive hardening, not a replacement.
 */
@Injectable()
export class OmnichannelWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { OMNICHANNEL_WEBHOOK_SECRET, TWILIO_AUTH_TOKEN } = loadEnv();
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers[WEBHOOK_SECRET_HEADER];
    if (provided !== OMNICHANNEL_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }

    if (TWILIO_AUTH_TOKEN) {
      const providedSignature = req.headers[TWILIO_SIGNATURE_HEADER] as string | undefined;
      if (!providedSignature) throw new UnauthorizedException('Missing X-Twilio-Signature header');
      if (!verifyTwilioSignature(TWILIO_AUTH_TOKEN, providedSignature, req)) {
        throw new UnauthorizedException('Invalid Twilio webhook signature');
      }
    }

    return true;
  }
}
