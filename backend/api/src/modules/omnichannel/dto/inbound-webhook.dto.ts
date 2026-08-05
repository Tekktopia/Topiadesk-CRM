import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Provider-agnostic shape, compatible with light field-mapping from
 * SendGrid Inbound Parse / Postmark / Mailgun's inbound webhooks — not
 * coupled to any one vendor's exact payload.
 */
export class InboundEmailWebhookDto {
  @ApiProperty() @IsString() from!: string;
  @ApiProperty() @IsString() to!: string;
  @ApiProperty() @IsString() subject!: string;
  @ApiProperty() @IsString() @MinLength(1) text!: string;
  @ApiProperty() @IsString() messageId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inReplyTo?: string;
}

/** Twilio-compatible-ish shape for WhatsApp/SMS inbound webhooks. */
export class InboundMessagingWebhookDto {
  @ApiProperty() @IsString() From!: string;
  @ApiProperty() @IsString() @MinLength(1) Body!: string;
  @ApiProperty() @IsString() MessageSid!: string;
}

export class InboundWebhookResponseDto {
  @ApiProperty() status!: 'created' | 'appended' | 'duplicate';
  @ApiProperty() caseId!: string | null;
}
