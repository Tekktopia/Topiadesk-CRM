import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Payload contract this endpoint expects from a Keycloak user-lifecycle
 * forwarder — e.g. a small SPI Event Listener or a poller against Keycloak's
 * Admin REST `/admin/realms/{realm}/events` translating to this shape. This
 * is deliberately NOT Keycloak's native admin-event JSON (far noisier,
 * covers every resource type). Wiring an actual forwarder into the realm is
 * out of scope for Phase 1 — see keycloak-webhook.controller.ts's top
 * comment for the current reachability caveat.
 */
export enum KeycloakWebhookEventType {
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_ENABLED = 'USER_ENABLED',
  USER_DISABLED = 'USER_DISABLED',
  USER_DELETED = 'USER_DELETED',
}

export class KeycloakWebhookAttributesDto {
  @ApiPropertyOptional({ description: 'Custom Keycloak user attribute mapped to departments.code' })
  @IsOptional()
  @IsString()
  departmentCode?: string;

  @ApiPropertyOptional({ description: 'Custom Keycloak user attribute mapped to branches.code' })
  @IsOptional()
  @IsString()
  branchCode?: string;
}

export class KeycloakWebhookEventDto {
  @ApiProperty({ enum: KeycloakWebhookEventType })
  @IsEnum(KeycloakWebhookEventType)
  eventType!: KeycloakWebhookEventType;

  @ApiProperty({ description: "Keycloak's internal user id (the JWT `sub` claim) — stored as users.keycloak_subject_id" })
  @IsString()
  keycloakSubjectId!: string;

  @ApiPropertyOptional({ description: 'Required for CREATED/UPDATED/ENABLED events' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;

  @ApiPropertyOptional({ default: true, description: 'false maps to the same local deactivation as USER_DISABLED' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: KeycloakWebhookAttributesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => KeycloakWebhookAttributesDto)
  attributes?: KeycloakWebhookAttributesDto;
}

export class KeycloakWebhookResponseDto {
  @ApiProperty() status!: string;
  @ApiProperty() action!: string;
  @ApiPropertyOptional({ nullable: true }) userId?: string | null;
}
