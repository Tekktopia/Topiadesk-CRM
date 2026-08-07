import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PermissionResponseDto } from './permission.dto';

export class RoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() isSystemRole!: boolean;
  /** 1 (default, every role starts here) = granting this role is
   * immediate. >1 routes a grant through approval — see
   * UsersController.assignRole()'s header comment. */
  @ApiProperty() requiredApprovalsToGrant!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [PermissionResponseDto] }) permissions!: PermissionResponseDto[];
}

export class ListRolesQueryDto {
  // Query params arrive as strings — IsBooleanString + ValidationPipe's
  // enableImplicitConversion handles the 'true'/'false' -> boolean coercion.
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() isSystemRole?: string;
}

/** isSystemRole is intentionally not settable here — only prisma/seed.ts creates system roles (ADMIN/MANAGER/ACCOUNT_HANDLER/COMPLIANCE_OFFICER, whose names are hard-coded in RLS SQL and PermissionGuard). */
export class CreateRoleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 10, description: '1 = immediate grant (default). >1 requires that many distinct approvers.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  requiredApprovalsToGrant?: number;
}
