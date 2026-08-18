import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { CustomFieldEntityType, CustomFieldType } from '@topiadesk/db';

export class CreateCustomFieldDefinitionDto {
  @ApiProperty({ enum: CustomFieldEntityType }) @IsEnum(CustomFieldEntityType) entityType!: CustomFieldEntityType;
  // Immutable after creation (see UpdateCustomFieldDefinitionDto) — jsonb
  // values already written under this key would be orphaned by a rename.
  @ApiProperty({ description: 'Stable jsonb key, e.g. "renewalRiskTier"' })
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, { message: 'key must start with a letter and contain only letters, digits, underscores' })
  key!: string;
  @ApiProperty() @IsString() @MinLength(1) label!: string;
  @ApiProperty({ enum: CustomFieldType }) @IsEnum(CustomFieldType) fieldType!: CustomFieldType;
  @ApiProperty({ required: false, type: [String], description: 'Required for SELECT/MULTI_SELECT' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() displayOrder?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() helpText?: string;
}

// entityType/key are deliberately excluded — both are immutable once other
// rows may already carry values under this definition (see CreateDto's key
// comment; entityType is part of the same orphaning risk).
export class UpdateCustomFieldDefinitionDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) label?: string;
  @ApiProperty({ enum: CustomFieldType, required: false }) @IsOptional() @IsEnum(CustomFieldType) fieldType?: CustomFieldType;
  @ApiProperty({ required: false, type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiProperty({ required: false, description: 'Soft-delete flag — set false instead of deleting the row' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() displayOrder?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() helpText?: string;
}

export class CustomFieldDefinitionQueryDto {
  @ApiProperty({ enum: CustomFieldEntityType, required: false }) @IsOptional() @IsEnum(CustomFieldEntityType) entityType?: CustomFieldEntityType;
  @ApiProperty({ enum: CustomFieldType, required: false }) @IsOptional() @IsEnum(CustomFieldType) fieldType?: CustomFieldType;
  /**
   * `@IsBooleanString` + explicit 'true' comparison, never a bare
   * `@IsBoolean()`: a query string arrives as text, and class-transformer
   * turns the string "false" into boolean `true` — which would silently
   * invert this filter.
   */
  @ApiProperty({ required: false, description: 'Filter by soft-delete state. Omit to see both.' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
  @ApiProperty({ required: false, description: 'Matches label or jsonb key (case-insensitive, substring).' })
  @IsOptional()
  @IsString()
  q?: string;
}

/** One entity's share of the schema — the shape the admin page charts. */
export class CustomFieldEntityCountDto {
  @ApiProperty({ enum: CustomFieldEntityType }) entityType!: string;
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
}

/**
 * Custom-schema aggregates.
 *
 * `required` is the number worth surfacing: every active required field is a
 * field a user must fill before they can save that entity, so it is the one
 * stat here with a direct cost to everyday data entry. It counts only ACTIVE
 * definitions — a deactivated required field is not enforced anywhere.
 */
export class CustomFieldDefinitionStatsResponseDto {
  @ApiProperty({ description: 'Definitions matching the current filter.' }) total!: number;
  @ApiProperty() active!: number;
  @ApiProperty({ description: 'Soft-deleted — retained so existing jsonb values are never orphaned.' })
  inactive!: number;
  @ApiProperty({ description: 'Active definitions users are forced to fill in.' }) required!: number;
  @ApiProperty({ type: [CustomFieldEntityCountDto] }) byEntityType!: CustomFieldEntityCountDto[];
}

export class CustomFieldDefinitionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CustomFieldEntityType }) entityType!: string;
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: CustomFieldType }) fieldType!: string;
  @ApiProperty({ nullable: true, type: [String] }) options!: unknown;
  @ApiProperty() isRequired!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() displayOrder!: number;
  @ApiProperty({ nullable: true }) helpText!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
