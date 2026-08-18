import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '@topiadesk/config';
import { verifyTwilioSignature } from '../../common/webhooks/twilio-signature.util';

const WEBHOOK_SECRET_HEADER = 'x-campaign-webhook-secret';
const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';

/**
 * Shared-secret check for the three provider-callback routes
 * (campaigns/webhooks/email|sms|whatsapp/events) — mirrors
 * identity/keycloak-webhook.guard.ts: the caller is an email/SMS/WhatsApp
 * provider (or, in this environment, a manually-curled simulation of
 * one), not a TopiaDesk user with roles, so PermissionGuard doesn't apply.
 * CAMPAIGN_WEBHOOK_SECRET is a required field in packages/config's
 * zod-validated Env, so a missing secret fails the whole app at boot
 * rather than at first webhook call.
 *
 * TWILIO_AUTH_TOKEN (optional): when set AND the request actually carries
 * an X-Twilio-Signature header, also verifies it via
 * common/webhooks/twilio-signature.util.ts — real for the sms/whatsapp
 * routes specifically (Twilio's real delivery-status callback shape,
 * form-encoded MessageStatus/MessageSid/To/From). Deliberately
 * conditional on the header's presence rather than the route: the email
 * route's DTO is intentionally provider-agnostic (see campaign-webhook.dto.ts's
 * own comment — no specific email ESP has been chosen yet, unlike SMS/
 * WhatsApp's confirmed Twilio shape), so it never sends this header and
 * this check simply doesn't apply there. Picking a specific email ESP
 * (SendGrid/Postmark/Mailgun, each with its own DTO shape AND its own
 * different signature scheme) is a vendor decision this pass doesn't
 * make unilaterally — flagged, not built.
 */
@Injectable()
export class CampaignWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { CAMPAIGN_WEBHOOK_SECRET, TWILIO_AUTH_TOKEN } = loadEnv();
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers[WEBHOOK_SECRET_HEADER];
    if (provided !== CAMPAIGN_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }

    const providedSignature = req.headers[TWILIO_SIGNATURE_HEADER] as string | undefined;
    if (TWILIO_AUTH_TOKEN && providedSignature && !verifyTwilioSignature(TWILIO_AUTH_TOKEN, providedSignature, req)) {
      throw new UnauthorizedException('Invalid Twilio webhook signature');
    }

    return true;
  }
}
