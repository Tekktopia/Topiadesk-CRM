import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { CaseManagementEntityType } from '@topiadesk/db';

/**
 * The `ActionSpec[]` JSON shape Macro.actions/AutomationRule.actions both
 * hold — see automation/action-handler.ts. `actionType` is validated
 * against the concrete registered handlers at apply/preview time (not here
 * via @IsIn, since the registry — not the DTO layer — is this shape's
 * single source of truth); ACTION_TYPES below is only for Swagger's enum
 * hint.
 */
const ACTION_TYPES = ['SET_STATUS', 'ASSIGN_TO_USER', 'ASSIGN_TO_TEAM', 'SET_PRIORITY', 'ADD_INTERNAL_NOTE', 'SEND_NOTIFICATION'] as const;

export class ActionSpecDto {
  @ApiProperty({ enum: ACTION_TYPES }) @IsString() @MinLength(1) actionType!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) @IsObject() params!: Record<string, unknown>;
}

export class CreateMacroDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ description: 'Free-text grouping label, e.g. "Renewals", "Escalations" — purely organizational' }) @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: CaseManagementEntityType }) @IsOptional() @IsEnum(CaseManagementEntityType) entityType?: CaseManagementEntityType;
  @ApiProperty({ type: [ActionSpecDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionSpecDto)
  actions!: ActionSpecDto[];
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

class MacroMutableFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: CaseManagementEntityType }) @IsOptional() @IsEnum(CaseManagementEntityType) entityType?: CaseManagementEntityType;
  @ApiPropertyOptional({ type: [ActionSpecDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionSpecDto)
  actions?: ActionSpecDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateMacroDto extends PartialType(MacroMutableFieldsDto) {}

export class MacroResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) category!: string | null;
  @ApiProperty({ nullable: true }) entityType!: string | null;
  @ApiProperty({ type: [ActionSpecDto] }) actions!: ActionSpecDto[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() usageCount!: number;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ApplyMacroRequestDto {
  @ApiPropertyOptional({ description: 'Overrides any params the macro action itself does not already specify — reserved for future use, currently unused' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class MacroPreviewRequestDto {
  @ApiProperty({ enum: ['CLAIM', 'CASE'] }) @IsIn(['CLAIM', 'CASE']) entityType!: 'CLAIM' | 'CASE';
  @ApiProperty() @IsUUID() entityId!: string;
}

export class MacroPreviewChangeDto {
  @ApiProperty() actionType!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional() currentValue?: unknown;
  @ApiPropertyOptional() newValue?: unknown;
}

export class MacroPreviewResponseDto {
  @ApiProperty() macroId!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ type: [MacroPreviewChangeDto] }) changes!: MacroPreviewChangeDto[];
}

export class ApplyMacroResponseDto {
  @ApiProperty() macroId!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) results!: unknown[];
}
