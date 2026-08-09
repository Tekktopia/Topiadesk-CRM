import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { CaseManagementEntityType, CasePriority, CaseType, SlaMetricType } from '@topiadesk/db';
import { ActionSpecDto } from './macro.dto';

export class CreateSlaTargetDto {
  @ApiProperty({ enum: SlaMetricType }) @IsEnum(SlaMetricType) metricType!: SlaMetricType;
  @ApiPropertyOptional({ description: 'ClaimStatus/CaseStatus value this target starts from — only meaningful for STAGE_TRANSITION' })
  @IsOptional()
  @IsString()
  fromStatus?: string;
  @ApiPropertyOptional({ description: 'ClaimStatus/CaseStatus value this target ends at — only meaningful for STAGE_TRANSITION' })
  @IsOptional()
  @IsString()
  toStatus?: string;
  @ApiProperty() @IsInt() @Min(1) targetMinutes!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) escalateAfterMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() escalateToUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() escalateToTeamId?: string;
  @ApiPropertyOptional({
    type: [ActionSpecDto],
    description: 'Reuses the same ActionSpec vocabulary Macro/AutomationRule actions use (action-handler.ts). Empty/omitted = the hardcoded "notify the assignee" behavior.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionSpecDto)
  onBreachActions?: ActionSpecDto[];
  @ApiPropertyOptional({ type: [ActionSpecDto], description: 'Same vocabulary as onBreachActions. Empty/omitted = the hardcoded "notify escalateTo" behavior.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionSpecDto)
  onEscalateActions?: ActionSpecDto[];
}

export class UpdateSlaTargetDto extends PartialType(CreateSlaTargetDto) {}

export class SlaTargetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() slaPolicyId!: string;
  @ApiProperty() metricType!: string;
  @ApiProperty({ nullable: true }) fromStatus!: string | null;
  @ApiProperty({ nullable: true }) toStatus!: string | null;
  @ApiProperty() targetMinutes!: number;
  @ApiProperty({ nullable: true }) escalateAfterMinutes!: number | null;
  @ApiProperty({ nullable: true }) escalateToUserId!: string | null;
  @ApiProperty({ nullable: true }) escalateToTeamId!: string | null;
  @ApiPropertyOptional({ type: [ActionSpecDto], nullable: true }) onBreachActions?: unknown;
  @ApiPropertyOptional({ type: [ActionSpecDto], nullable: true }) onEscalateActions?: unknown;
}

export class CreateSlaPolicyDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: CaseManagementEntityType }) @IsEnum(CaseManagementEntityType) entityType!: CaseManagementEntityType;
  @ApiPropertyOptional({ enum: CaseType }) @IsOptional() @IsEnum(CaseType) caseType?: CaseType;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() businessHoursCalendarId?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ default: 0, description: 'Tiebreak rank when two policies match a case equally specifically — higher wins.' })
  @IsOptional()
  @IsInt()
  rank?: number;
  @ApiPropertyOptional({ type: [CreateSlaTargetDto], description: 'Optional initial targets, created alongside the policy' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSlaTargetDto)
  targets?: CreateSlaTargetDto[];
}

class SlaPolicyMutableFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional({ enum: CaseType }) @IsOptional() @IsEnum(CaseType) caseType?: CaseType;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() businessHoursCalendarId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: 'Tiebreak rank when two policies match a case equally specifically — higher wins.' })
  @IsOptional()
  @IsInt()
  rank?: number;
}

/** entityType is immutable post-creation — it discriminates which SlaTarget metric types are meaningful and which entity's clocks the policy drives. */
export class UpdateSlaPolicyDto extends PartialType(SlaPolicyMutableFieldsDto) {}

export class SlaPolicyResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ nullable: true }) caseType!: string | null;
  @ApiProperty({ nullable: true }) priority!: string | null;
  @ApiProperty({ nullable: true }) businessHoursCalendarId!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() rank!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: [SlaTargetResponseDto] }) targets?: SlaTargetResponseDto[];
}

export class SlaClockResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) claimId!: string | null;
  @ApiProperty({ nullable: true }) caseId!: string | null;
  @ApiProperty() slaTargetId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() startedAt!: Date;
  @ApiProperty() dueAt!: Date;
  @ApiProperty({ nullable: true }) pausedAt!: Date | null;
  @ApiProperty() totalPausedMinutes!: number;
  @ApiProperty({ nullable: true }) satisfiedAt!: Date | null;
  @ApiProperty({ nullable: true }) breachedAt!: Date | null;
  @ApiProperty({ nullable: true }) escalatedAt!: Date | null;
}

export class SlaComplianceReportRowDto {
  @ApiProperty() slaTargetId!: string;
  @ApiProperty() slaPolicyId!: string;
  @ApiProperty() policyName!: string;
  @ApiProperty() metricType!: string;
  @ApiProperty() totalClocks!: number;
  @ApiProperty() satisfiedCount!: number;
  @ApiProperty() breachedCount!: number;
  @ApiProperty() runningCount!: number;
  @ApiProperty() pausedCount!: number;
  @ApiProperty({ description: 'satisfiedCount / (satisfiedCount + breachedCount), as a percentage — clocks still RUNNING/PAUSED are excluded from the denominator (not yet decided)' })
  percentAchieved!: number | null;
}
