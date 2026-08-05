import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
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
