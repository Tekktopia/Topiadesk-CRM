import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WebhookSubscriptionsController } from './webhook-subscriptions.controller';
import { WebhookReceiverController } from './webhook-receiver.controller';
import { TeamsActionsController } from './teams-actions.controller';
import { OAuthController } from './oauth.controller';
import { OAuthConnectorService } from './oauth-connector.service';
import { PaystackService } from './paystack.service';
import { DojahService } from './dojah.service';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { ESignatureService } from './esignature.service';
import { KeycloakAdminService } from '../identity/keycloak-admin.service';

// KeycloakAdminService (needed by IntegrationsService's SeamlessHR sync
// path) is provided by IdentityModule but not exported from it — same
// "re-provide the stateless service directly" pattern IdentityModule's own
// header comment documents for AuditService, applied here for the same
// reason (a second injector instance is harmless: it only holds a
// short-lived cached admin token).
@Module({
  controllers: [IntegrationsController, WebhookSubscriptionsController, WebhookReceiverController, OAuthController, TeamsActionsController],
  providers: [IntegrationsService, OAuthConnectorService, KeycloakAdminService, PaystackService, DojahService, WhatsAppCloudService, ESignatureService],
  exports: [PaystackService, DojahService, WhatsAppCloudService, ESignatureService],
})
export class IntegrationsModule {}
