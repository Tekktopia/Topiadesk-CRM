import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { WebhookEventType } from '@topiadesk/db';

// Prisma generates a runtime const object for enums (confirmed empirically:
// `Object.values(WebhookEventType)` — not just a TypeScript type), so this
// derives validation directly from the schema-defined enum rather than a
// second hand-maintained list that could drift from it.
const WEBHOOK_EVENT_TYPES = Object.values(WebhookEventType);

export class CreateWebhookSubscriptionDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsUrl({ require_tld: false }) targetUrl!: string;
  @ApiProperty({ enum: WEBHOOK_EVENT_TYPES, isArray: true })
  @IsArray()
  @IsIn(WEBHOOK_EVENT_TYPES, { each: true })
  eventTypes!: string[];
}

export class UpdateWebhookSubscriptionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) targetUrl?: string;
  @ApiPropertyOptional({ enum: WEBHOOK_EVENT_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(WEBHOOK_EVENT_TYPES, { each: true })
  eventTypes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WebhookSubscriptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() targetUrl!: string;
  @ApiProperty({ type: [String] }) eventTypes!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** Only this response ever carries the raw signing secret — see webhook-signing.util.ts. */
export class WebhookSubscriptionCreatedResponseDto extends WebhookSubscriptionResponseDto {
  @ApiProperty({ description: 'HMAC-SHA256 signing secret — shown once, store it now. Verify inbound deliveries with it (see webhook-signing.util.ts).' })
  signingSecret!: string;
}

export class WebhookDeliveryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() subscriptionId!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) payload!: unknown;
  @ApiProperty() status!: string;
  @ApiProperty() attemptCount!: number;
  @ApiProperty({ nullable: true }) lastAttemptAt!: Date | null;
  @ApiProperty({ nullable: true }) nextAttemptAt!: Date | null;
  @ApiProperty({ nullable: true }) responseStatus!: number | null;
  @ApiProperty({ nullable: true }) responseBodySnippet!: string | null;
  @ApiProperty() correlationId!: string;
  @ApiProperty() createdAt!: Date;
}
