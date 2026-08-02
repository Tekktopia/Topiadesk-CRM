import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

// Loose on purpose (this stores admin-entered ranges for future enforcement
// middleware, not RFC-strict parsing) — accepts IPv4/IPv6 with optional
// CIDR suffix.
const CIDR_PATTERN = /^((\d{1,3}\.){3}\d{1,3}(\/(3[0-2]|[12]?\d))?|[0-9a-fA-F:]+(\/(12[0-8]|1[01]\d|\d{1,2}))?)$/;

/**
 * Admin management of the whitelist table only — enforcement is a separate,
 * not-yet-built piece (app-layer middleware reading a Redis-cached copy of
 * this table, per the schema comment on IpWhitelistEntry; .env.example's
 * IP_WHITELIST_ENFORCED flag gates it). CRUD here is real regardless of
 * whether enforcement exists yet.
 */
export class IpWhitelistEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() cidrRange!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) appliesToRoleId!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class CreateIpWhitelistEntryDto {
  @ApiProperty({ example: '10.0.0.0/24' })
  @IsString()
  @Matches(CIDR_PATTERN, { message: 'cidrRange must be a valid IPv4/IPv6 address or CIDR range' })
  cidrRange!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Restrict this entry to a specific role; omit/null to apply to all roles' })
  @IsOptional()
  @IsUUID()
  appliesToRoleId?: string | null;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateIpWhitelistEntryDto {
  @ApiPropertyOptional({ example: '10.0.0.0/24' })
  @IsOptional()
  @IsString()
  @Matches(CIDR_PATTERN, { message: 'cidrRange must be a valid IPv4/IPv6 address or CIDR range' })
  cidrRange?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  appliesToRoleId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
