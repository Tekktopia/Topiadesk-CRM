import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;

export class UserRoleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

/**
 * Deliberately excludes nothing-secret-to-leak-in-the-first-place (Keycloak
 * owns credentials, there's no password field) but is still explicit about
 * the surface: identifiers + org placement + role names, no raw JWT/session
 * data.
 */
export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() keycloakSubjectId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) departmentId!: string | null;
  @ApiProperty({ nullable: true }) branchId!: string | null;
  @ApiProperty({ nullable: true }) managerId!: string | null;
  @ApiProperty({ nullable: true }) positionTitle!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [UserRoleSummaryDto] }) roles!: UserRoleSummaryDto[];
  @ApiProperty({ nullable: true }) lastSyncedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Case-insensitive match against full name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) phone?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Pass null to unassign' })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Pass null to unassign' })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Pass null to unassign' })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Free text — e.g. "Team Lead", "Supervisor". Pass null to clear.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  positionTitle?: string | null;
}

export class AssignRoleDto {
  @ApiProperty() @IsUUID() roleId!: string;
}

/** Individual create — distinct from BulkInviteUsersDto's rows (which take
 * departmentCode/branchCode for CSV lookup); this is fed by a real form
 * with real pickers, so it takes ids directly. No roleIds — role
 * assignment stays a separate step through assignRole(), which already
 * carries its own approval-chain logic for roles like COMPLIANCE_OFFICER;
 * replicating that inline here would meaningfully complicate creation for
 * no real gain. */
export class CreateUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) fullName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
  @ApiPropertyOptional({ description: 'Free text — e.g. "Team Lead", "Supervisor"' }) @IsOptional() @IsString() @MaxLength(100) positionTitle?: string;
}

export class CreateUserResponseDto {
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;
  @ApiProperty({ description: 'One-time temporary password — shown once, never stored or logged. Also emailed to the new user. The account is forced to change it on next sign-in.' })
  temporaryPassword!: string;
}
