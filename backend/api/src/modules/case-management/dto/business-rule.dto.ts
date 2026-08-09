import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { BusinessRuleOperator, CaseManagementEntityType } from '@topiadesk/db';

const ACTION_EFFECTS = ['REQUIRE', 'HIDE', 'READONLY', 'SET_VALUE'] as const;

export class BusinessRuleActionDto {
  @ApiProperty({ description: 'Must be an allow-listed action field for the rule\'s entityType — see ACTION_FIELDS in business-rules.validator.ts' })
  @IsString()
  field!: string;
  @ApiProperty({ enum: ACTION_EFFECTS }) @IsIn(ACTION_EFFECTS) effect!: (typeof ACTION_EFFECTS)[number];
  @ApiProperty({ required: false, description: 'Only used when effect is SET_VALUE' }) @IsOptional() @IsString() value?: string;
}

export class CreateBusinessRuleDto {
  @ApiProperty({ enum: CaseManagementEntityType, description: 'CASE only in v1 — see BusinessRule model doc comment' })
  @IsEnum(CaseManagementEntityType)
  entityType!: CaseManagementEntityType;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ description: 'Must be an allow-listed condition field for entityType — see CONDITION_FIELDS in business-rules.validator.ts' })
  @IsString()
  conditionField!: string;
  @ApiProperty({ enum: BusinessRuleOperator }) @IsEnum(BusinessRuleOperator) conditionOperator!: BusinessRuleOperator;
  @ApiProperty() @IsString() conditionValue!: string;
  @ApiProperty({ type: [BusinessRuleActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessRuleActionDto)
  actions!: BusinessRuleActionDto[];
  @ApiProperty({ required: false, default: true }) @IsOptional() isActive?: boolean;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() displayOrder?: number;
}

// entityType is deliberately excluded — immutable once created, same
// reasoning as CustomFieldDefinition's key/entityType (see that dto file).
export class UpdateBusinessRuleDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() conditionField?: string;
  @ApiProperty({ enum: BusinessRuleOperator, required: false }) @IsOptional() @IsEnum(BusinessRuleOperator) conditionOperator?: BusinessRuleOperator;
  @ApiProperty({ required: false }) @IsOptional() @IsString() conditionValue?: string;
  @ApiProperty({ type: [BusinessRuleActionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessRuleActionDto)
  actions?: BusinessRuleActionDto[];
  @ApiProperty({ required: false }) @IsOptional() isActive?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() displayOrder?: number;
}

export class BusinessRuleQueryDto {
  @ApiProperty({ enum: CaseManagementEntityType, required: false }) @IsOptional() @IsEnum(CaseManagementEntityType) entityType?: CaseManagementEntityType;
}

export class BusinessRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CaseManagementEntityType }) entityType!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() conditionField!: string;
  @ApiProperty({ enum: BusinessRuleOperator }) conditionOperator!: string;
  @ApiProperty() conditionValue!: string;
  @ApiProperty({ type: [BusinessRuleActionDto] }) actions!: unknown;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
