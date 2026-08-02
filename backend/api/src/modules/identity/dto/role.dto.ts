import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PermissionResponseDto } from './permission.dto';

export class RoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() isSystemRole!: boolean;
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
}
