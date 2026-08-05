import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Generic provider-callback payload shape — there is no real email/SMS/
 * WhatsApp provider wired up in this environment, so this is designed
 * against the lowest common denominator every real provider's webhook
 * eventually reduces to (Postmark/SendGrid/Twilio/WhatsApp Business Cloud
 * API all report roughly: "this externalMessageId reached this state at
 * this time"), not any one vendor's actual wire format. correlate via
 * CampaignRecipient.externalMessageId.
 */
export class CampaignWebhookEventDto {
  @ApiProperty({ description: 'The provider-assigned message id set on CampaignRecipient.externalMessageId at send time' })
  @IsString()
  @MinLength(1)
  externalMessageId!: string;

  @ApiProperty({ enum: ['DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED'] })
  @IsIn(['DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED'])
  eventType!: 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINED' | 'FAILED';

  @ApiProperty({ required: false, description: 'Defaults to now() if omitted' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiProperty({ required: false, description: 'Bounce/complaint/failure reason from the provider' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CampaignWebhookResponseDto {
  @ApiProperty() matched!: boolean;
  @ApiProperty({ nullable: true }) recipientId!: string | null;
}
