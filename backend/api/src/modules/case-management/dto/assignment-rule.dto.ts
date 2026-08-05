import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AssignmentStrategy, CaseManagementEntityType } from '@topiadesk/db';

/** conditions: `{ caseType?: CaseType, priority?: CasePriority }` — simple equality match against the entity being resolved, interpreted in assignment-resolver.util.ts's conditionsMatch(). Loosely typed here (IsObject) since it's a small, evolving shape, matching CreateBusinessHoursCalendarDto's weeklyHours precedent. */
export class CreateAssignmentRuleDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: CaseManagementEntityType }) @IsEnum(CaseManagementEntityType) entityType!: CaseManagementEntityType;
  @ApiProperty({ enum: AssignmentStrategy }) @IsEnum(AssignmentStrategy) strategy!: AssignmentStrategy;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, default: {} }) @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsUUID() candidatePoolTeamId?: string;
  @ApiPropertyOptional({ type: [String], default: [] }) @IsOptional() @IsArray() @IsString({ each: true }) requiredSkillTags?: string[];
  @ApiPropertyOptional({ default: 0, description: 'Higher priority rules are considered first' }) @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

class AssignmentRuleMutableFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional({ enum: AssignmentStrategy }) @IsOptional() @IsEnum(AssignmentStrategy) strategy?: AssignmentStrategy;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsUUID() candidatePoolTeamId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) requiredSkillTags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/** entityType and lastAssignedUserId (the round-robin cursor — system-managed, see resolveNextAssignee) are deliberately not client-settable here. */
export class UpdateAssignmentRuleDto extends PartialType(AssignmentRuleMutableFieldsDto) {}

export class AssignmentRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() strategy!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) conditions!: unknown;
  @ApiProperty({ nullable: true }) candidatePoolTeamId!: string | null;
  @ApiProperty({ type: [String] }) requiredSkillTags!: string[];
  @ApiProperty() priority!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true }) lastAssignedUserId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AssignmentTestResponseDto {
  @ApiProperty() ruleId!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty() reasoning!: string;
}
