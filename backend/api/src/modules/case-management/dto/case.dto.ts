import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBooleanString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ActivityType, CasePriority, CaseStatus, CaseType } from '@topiadesk/db';

/** Express/qs collapses a single repeated query param (`?assignedToIds=a`) to a bare string instead of a 1-element array — normalize before @IsArray/@IsUUID(each) run. */
const toArray = ({ value }: { value: unknown }): unknown => (value === undefined || Array.isArray(value) ? value : [value]);

export const DATE_RANGE_PRESETS = ['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH'] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const RESOLUTION_DUE_BY_PRESETS = ['OVERDUE', 'DUE_TODAY', 'DUE_THIS_WEEK'] as const;
export type ResolutionDueByPreset = (typeof RESOLUTION_DUE_BY_PRESETS)[number];

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
  @ApiPropertyOptional({ description: 'Children of this case — powers the ticket detail page\'s "Related tickets" table' }) @IsOptional() @IsUUID() parentCaseId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Assignee IN-filter — repeat the query param once per id (ticket workspace\'s "Agents Include")' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID('4', { each: true })
  assignedToIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Team IN-filter — repeat the query param once per id ("Groups Include")' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID('4', { each: true })
  assignedTeamIds?: string[];

  @ApiPropertyOptional({ type: [String], enum: CaseStatus, isArray: true, description: 'status IN-filter — repeat the query param once per value' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(CaseStatus, { each: true })
  statuses?: CaseStatus[];

  @ApiPropertyOptional({ type: [String], enum: CaseStatus, isArray: true, description: 'status NOT-IN filter — repeat the query param once per value ("unresolved", "open in my groups", etc.)' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(CaseStatus, { each: true })
  excludeStatuses?: CaseStatus[];

  @ApiPropertyOptional({ type: [String], enum: CasePriority, isArray: true, description: 'priority IN-filter — repeat the query param once per value' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(CasePriority, { each: true })
  priorities?: CasePriority[];

  @ApiPropertyOptional({ description: 'Narrow to cases whose assignedTeamId is one of the caller\'s own teams — resolved server-side from TeamMember, never client-suppliable team ids' })
  @IsOptional()
  @IsBooleanString()
  myTeams?: string;

  @ApiPropertyOptional({ description: 'Maps to createdById — "tickets I raised"' }) @IsOptional() @IsUUID() raisedByUserId?: string;
  @ApiPropertyOptional({ description: 'Cases with a CaseWatcher row for this user — "tickets I\'m watching"' }) @IsOptional() @IsUUID() watchingUserId?: string;

  @ApiPropertyOptional({ description: 'status=NEW, OR assignedToId=caller AND status not in RESOLVED/CLOSED — "new and my open tickets"' })
  @IsOptional()
  @IsBooleanString()
  newOrMine?: string;

  @ApiPropertyOptional({ description: 'Cases with at least one comment whose outbound email delivery failed' })
  @IsOptional()
  @IsBooleanString()
  undeliveredOnly?: string;

  @ApiPropertyOptional({ enum: RESOLUTION_DUE_BY_PRESETS, description: 'Filters on the RUNNING RESOLUTION SlaClock\'s dueAt' })
  @IsOptional()
  @IsIn(RESOLUTION_DUE_BY_PRESETS)
  resolutionDueBy?: ResolutionDueByPreset;

  @ApiPropertyOptional({ enum: DATE_RANGE_PRESETS }) @IsOptional() @IsIn(DATE_RANGE_PRESETS) createdPreset?: DateRangePreset;
  @ApiPropertyOptional({ enum: DATE_RANGE_PRESETS }) @IsOptional() @IsIn(DATE_RANGE_PRESETS) closedPreset?: DateRangePreset;
  @ApiPropertyOptional({ enum: DATE_RANGE_PRESETS }) @IsOptional() @IsIn(DATE_RANGE_PRESETS) resolvedPreset?: DateRangePreset;

  @ApiPropertyOptional({ description: 'Case-insensitive match against subject/caseNumber' }) @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) skip?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 100 }) @IsOptional() @IsInt() @Min(1) @Max(100) take?: number;

  @ApiPropertyOptional({ enum: ['createdAt', 'priority', 'status'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'priority', 'status'])
  sortBy?: 'createdAt' | 'priority' | 'status';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' }) @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
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

/** Cases have no delete endpoint at all (not a deletable entity) — bulk actions are assign + status-update only, mirroring exactly what the ticket workspace's UI already offers (reassign owner, close). */
export class BulkAssignCasesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() assignedToId!: string;
}

/** `status` is required, not optional — unlike CRM's bulk/update (a generic field-patch), this always goes through applyCaseStatusTransition per row (case-lifecycle.ts's real state machine), so there's no meaningful "update with nothing to update" call. */
export class BulkUpdateCasesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ enum: CaseStatus }) @IsEnum(CaseStatus) status!: CaseStatus;
}
