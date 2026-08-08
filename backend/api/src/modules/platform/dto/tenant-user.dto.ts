import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateTenantAdminUserDto {
  @ApiProperty({ description: "The new admin's sign-in email — created in the tenant's own Keycloak realm and receives the invite email." })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;
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
  @ApiProperty({ description: 'One-time temporary password — shown once, never stored or logged. The account is forced to change it on next sign-in.' })
  temporaryPassword!: string;
}

export class TenantAdminSummaryDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() status!: string;
  @ApiProperty() totalUsers!: number;
  @ApiProperty() adminCount!: number;
}
