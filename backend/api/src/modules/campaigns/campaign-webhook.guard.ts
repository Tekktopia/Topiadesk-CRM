import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '@topiadesk/config';

const WEBHOOK_SECRET_HEADER = 'x-campaign-webhook-secret';

/**
 * Shared-secret check for the three provider-callback routes
 * (campaigns/webhooks/email|sms|whatsapp/events) — mirrors
 * identity/keycloak-webhook.guard.ts exactly: the caller is an email/SMS/
 * WhatsApp provider (or, in this environment, a manually-curled
 * simulation of one — there's no real provider integration wired up), not
 * a TopiaDesk user with roles, so PermissionGuard doesn't apply.
 * CAMPAIGN_WEBHOOK_SECRET is a required field in packages/config's
 * zod-validated Env, so a missing secret fails the whole app at boot
 * rather than at first webhook call.
 *
 * No constructor-injected dependencies, so this guard isn't subject to the
 * import-type DI footgun documented in permission.guard.ts.
 */
@Injectable()
export class CampaignWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { CAMPAIGN_WEBHOOK_SECRET } = loadEnv();
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers[WEBHOOK_SECRET_HEADER];
    if (provided !== CAMPAIGN_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }
    return true;
  }
}
