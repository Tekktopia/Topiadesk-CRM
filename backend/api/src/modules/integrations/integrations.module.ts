import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WebhookSubscriptionsController } from './webhook-subscriptions.controller';
import { WebhookReceiverController } from './webhook-receiver.controller';
import { OAuthController } from './oauth.controller';
import { OAuthConnectorService } from './oauth-connector.service';

@Module({
  controllers: [IntegrationsController, WebhookSubscriptionsController, WebhookReceiverController, OAuthController],
  providers: [IntegrationsService, OAuthConnectorService],
})
export class IntegrationsModule {}
