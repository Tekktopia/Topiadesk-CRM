import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ description: "The tenant organization's display name, e.g. \"Acme Insurance Brokers\"." })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: 'URL-safe, globally unique identifier — becomes this tenant\'s Postgres schema name and Keycloak realm name (both `tenant_<slug>`). Lowercase letters, digits, and underscores only.' })
  @IsString()
  @Matches(/^[a-z0-9_]+$/, { message: 'slug must contain only lowercase letters, digits, and underscores' })
  @MinLength(2)
  slug!: string;

  @ApiProperty({ description: "The tenant's first ADMIN user is created with this address and receives the invite email." })
  @IsEmail()
  primaryContactEmail!: string;

  @ApiProperty({ description: 'Plan to start this tenant on (TRIALING).' })
  @IsUUID()
  planId!: string;
}

export class UpdateTenantSubscriptionDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiPropertyOptional({ enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'] })
  @IsOptional()
  @IsString()
  status?: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  @ApiPropertyOptional({
    description: 'When provided, sets currentPeriodEnd to now + this many months — "generating/renewing a license" is this field plus a plan/status change, not a separate artifact. Omit to leave currentPeriodEnd untouched.',
    minimum: 1,
    maximum: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  durationMonths?: number;
}

export class TenantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() schemaName!: string;
  @ApiProperty() keycloakRealm!: string;
  @ApiProperty() status!: string;
  @ApiProperty() primaryContactEmail!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class TenantProvisioningEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() step!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() detail?: string | null;
  @ApiProperty() occurredAt!: Date;
}
