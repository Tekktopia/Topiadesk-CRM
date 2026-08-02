import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
}

export class AssignRoleDto {
  @ApiProperty() @IsUUID() roleId!: string;
}
