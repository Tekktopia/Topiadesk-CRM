import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/** Mirrors createTenantRealm()'s own realm passwordPolicy string exactly
 * (backend/worker/src/jobs/platform/keycloak-realm-provisioning.ts:
 * "length(12) and upperCase(1) and lowerCase(1) and digits(1) and
 * specialChars(1)") — validated here so a policy violation surfaces as an
 * immediate, specific 400 instead of an opaque Keycloak error later in the
 * (for create, asynchronous) provisioning flow. */
const TENANT_PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const PASSWORD_POLICY_MESSAGE = 'Password must be at least 12 characters and include an uppercase letter, a lowercase letter, a digit, and a special character.';

export class CreateTenantAdminUserDto {
  @ApiProperty({ description: "The new admin's sign-in email — created in the tenant's own Keycloak realm and receives the invite email." })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiPropertyOptional({
    description:
      'Set a specific sign-in password instead of generating one and emailing it. When set, the account is not forced to change its password on first sign-in (MFA setup is still required).',
  })
  @IsOptional()
  @IsString()
  @Matches(TENANT_PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE })
  password?: string;
}

export class ResetTenantUserPasswordDto {
  @ApiPropertyOptional({ description: 'Same as CreateTenantAdminUserDto.password — set a specific password instead of generating one.' })
  @IsOptional()
  @IsString()
  @Matches(TENANT_PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE })
  password?: string;
}

export class TenantUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() keycloakSubjectId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiPropertyOptional() lastSyncedAt?: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class ResetTenantUserPasswordResponseDto {
  @ApiProperty({
    description:
      'The password now in effect — never stored or logged beyond this response. Generated + forces a change on next sign-in unless the caller supplied their own via ResetTenantUserPasswordDto.',
  })
  temporaryPassword!: string;
}

/**
 * Composite risk signal — see tenants.controller.ts's computeTenantHealth()
 * for exactly what feeds this. Deliberately just Subscription + seats +
 * SupportTicket data (all real today); no login/activity-recency factor
 * exists anywhere in the schema yet.
 */
export type TenantHealth = 'HEALTHY' | 'AT_RISK' | 'CRITICAL';
export const TENANT_HEALTH_VALUES = ['HEALTHY', 'AT_RISK', 'CRITICAL'] as const;

export class TenantHealthDto {
  @ApiProperty({ enum: TENANT_HEALTH_VALUES }) health!: TenantHealth;
  @ApiProperty({ type: [String], description: 'Human-readable factors that contributed to the health verdict, empty when HEALTHY.' })
  healthReasons!: string[];
}

export class TenantAdminSummaryDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() status!: string;
  @ApiProperty() totalUsers!: number;
  @ApiProperty() adminCount!: number;
  @ApiPropertyOptional({ description: 'Null if the tenant has no subscription (shouldn\'t happen in practice — every tenant gets one at creation — but not enforced at the DB level).' })
  seatLimit?: number | null;
  @ApiProperty({ enum: TENANT_HEALTH_VALUES }) health!: TenantHealth;
  @ApiProperty({ type: [String] }) healthReasons!: string[];
}

export class TenantUsageDto {
  @ApiProperty() totalUsers!: number;
  @ApiProperty() activeUsers!: number;
  @ApiProperty() deactivatedUsers!: number;
  @ApiProperty() suspendedUsers!: number;
  @ApiProperty() adminCount!: number;
  @ApiPropertyOptional() planName?: string | null;
  @ApiPropertyOptional() seatLimit?: number | null;
}
