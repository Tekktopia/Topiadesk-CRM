import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ActivityType, CasePriority, CaseStatus, CaseType } from '@topiadesk/db';

export class CreateCaseDto {
  @ApiProperty({ enum: CaseType }) @IsEnum(CaseType) caseType!: CaseType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiProperty() @IsString() @MinLength(1) subject!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() policyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedTeamId?: string;
  @ApiPropertyOptional({ description: 'Explicit SlaPolicy override — otherwise resolved automatically by entityType/caseType/priority' })
  @IsOptional()
  @IsUUID()
  slaPolicyId?: string;
  @ApiPropertyOptional({ enum: ActivityType }) @IsOptional() @IsEnum(ActivityType) sourceChannel?: ActivityType;
}

class CaseMutableFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() policyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedTeamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() slaPolicyId?: string;
  @ApiPropertyOptional({ enum: ActivityType }) @IsOptional() @IsEnum(ActivityType) sourceChannel?: ActivityType;
}

/** status/caseType/caseNumber deliberately absent — caseType and caseNumber are immutable post-creation, status changes exclusively through POST :id/status (see case-lifecycle.ts). */
export class UpdateCaseDto extends PartialType(CaseMutableFieldsDto) {}

export class CaseQueryDto {
  @ApiPropertyOptional({ enum: CaseStatus }) @IsOptional() @IsEnum(CaseStatus) status?: CaseStatus;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiPropertyOptional({ enum: CaseType }) @IsOptional() @IsEnum(CaseType) caseType?: CaseType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedTeamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
}

export class CaseQueueQueryDto {
  @ApiPropertyOptional({ description: 'Restrict the unassigned queue to one team' }) @IsOptional() @IsUUID() teamId?: string;
}

export class ChangeCaseStatusDto {
  @ApiProperty({ enum: CaseStatus }) @IsEnum(CaseStatus) status!: CaseStatus;
  @ApiPropertyOptional({ description: 'Stored as resolutionNotes when status is RESOLVED' }) @IsOptional() @IsString() reason?: string;
}

export class LinkChildCaseDto {
  @ApiProperty() @IsUUID() childCaseId!: string;
}

export class MergeCaseDto {
  @ApiProperty({ description: 'The case that survives — the case in the URL becomes its (non-destructive) MERGED child' }) @IsUUID() targetCaseId!: string;
}

export class CaseResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseNumber!: string;
  @ApiProperty() caseType!: string;
  @ApiProperty({ nullable: true }) categoryId!: string | null;
  @ApiProperty() subject!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty({ nullable: true }) accountId!: string | null;
  @ApiProperty({ nullable: true }) contactId!: string | null;
  @ApiProperty({ nullable: true }) policyId!: string | null;
  @ApiProperty({ nullable: true }) assignedToId!: string | null;
  @ApiProperty({ nullable: true }) assignedTeamId!: string | null;
  @ApiProperty({ nullable: true, description: 'The requester/filer — distinct from assignedToId. Null for system/omnichannel-originated cases.' }) createdById!: string | null;
  @ApiProperty({ nullable: true }) slaPolicyId!: string | null;
  @ApiProperty({ nullable: true }) parentCaseId!: string | null;
  @ApiProperty({ nullable: true }) linkType!: string | null;
  @ApiProperty() reopenCount!: number;
  @ApiProperty({ nullable: true }) sourceChannel!: string | null;
  @ApiProperty({ nullable: true }) firstRespondedAt!: Date | null;
  @ApiProperty({ nullable: true }) resolutionNotes!: string | null;
  @ApiProperty({ nullable: true }) resolvedAt!: Date | null;
  @ApiProperty({ nullable: true }) closedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
