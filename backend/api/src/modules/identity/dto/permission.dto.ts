import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

/** Permissions themselves are seed-managed (resource/action/scope grid) — read-only via this API; roles.dto's RolePermission grants are what's mutable. */
export class PermissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() resource!: string;
  @ApiProperty() action!: string;
  @ApiProperty() scope!: string;
}

export class ListPermissionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() resource?: string;
}

export class GrantPermissionDto {
  @ApiProperty() @IsUUID() permissionId!: string;
}
