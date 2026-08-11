import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { FieldPermissionVisibility } from '@topiadesk/db';
import { FIELD_PERMISSION_CATALOG } from '../../../common/field-permissions/field-visibility.util';

const ALL_RESOURCES = Object.keys(FIELD_PERMISSION_CATALOG);

export class FieldPermissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() resource!: string;
  @ApiProperty() fieldName!: string;
  @ApiProperty({ enum: FieldPermissionVisibility }) visibility!: string;
  @ApiProperty() createdAt!: Date;
}

export class ListFieldPermissionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() roleId?: string;
  @ApiPropertyOptional({ enum: ALL_RESOURCES }) @IsOptional() @IsIn(ALL_RESOURCES) resource?: string;
}

/**
 * `resource`/`fieldName` are validated against FIELD_PERMISSION_CATALOG's
 * fixed allowlist (not free strings) — see that catalog's own comment for
 * why there's no canonical field-catalog table to FK against instead.
 */
export class UpsertFieldPermissionDto {
  @ApiProperty() @IsUUID() roleId!: string;
  @ApiProperty({ enum: ALL_RESOURCES }) @IsIn(ALL_RESOURCES) resource!: string;
  @ApiProperty() @IsString() fieldName!: string;
  @ApiProperty({ enum: FieldPermissionVisibility }) @IsEnum(FieldPermissionVisibility) visibility!: FieldPermissionVisibility;
}
