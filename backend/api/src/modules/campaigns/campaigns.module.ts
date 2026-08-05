import { Module } from '@nestjs/common';
import { AudienceSegmentsController } from './audience-segments.controller';
import { CampaignSuppressionsController } from './campaign-suppressions.controller';
import { CampaignTemplatesController } from './campaign-templates.controller';
import { CampaignsController } from './campaigns.controller';
import { CampaignWebhooksController } from './campaign-webhooks.controller';
import { PublicUnsubscribeController } from './public-unsubscribe.controller';

@Module({
  controllers: [
    AudienceSegmentsController,
    CampaignTemplatesController,
    CampaignsController,
    CampaignSuppressionsController,
    CampaignWebhooksController,
    PublicUnsubscribeController,
  ],
})
export class CampaignsModule {}
