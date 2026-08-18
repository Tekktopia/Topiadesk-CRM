import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { AccountType, LeadStatus } from '@topiadesk/db';

export class CreateLeadDto {
  @ApiProperty({ description: 'A LeadSource.code — see GET /crm/lead-sources for the admin-managed list' }) @IsString() @MinLength(1) source!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sourceCampaign?: string;
  @ApiProperty() @IsString() @MinLength(1) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) lastName!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() companyName?: string;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @ApiProperty({ enum: LeadStatus, required: false }) @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() qualificationNotes?: string;
  // Validated against active CustomFieldDefinition rows for LEAD in
  // LeadsController before write — see custom-fields.validator.ts.
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class LeadQueryDto {
  @ApiProperty({ enum: LeadStatus, required: false }) @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @ApiProperty({ required: false, description: 'A LeadSource.code' }) @IsOptional() @IsString() source?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(100) minScore?: number;
  @ApiPropertyOptional({ description: 'Free-text search across first/last name, email, company and phone.' })
  @IsOptional()
  @IsString()
  q?: string;
  @ApiPropertyOptional({ description: 'Upper bound of the score band, paired with minScore.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  maxScore?: number;
  @ApiPropertyOptional({ description: 'Only leads created on/after this instant (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;
  @ApiPropertyOptional({ description: 'Only leads created on/before this instant (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
  // Query strings arrive as strings; @Type coerces before @IsInt runs. The
  // list endpoint caps rows for payload size, which is exactly why the
  // sibling /count endpoint exists — see accounts.controller.ts's count().
  @ApiPropertyOptional({ description: 'Max rows to return (default 50).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
  @ApiPropertyOptional({ description: 'Rows to skip, for pagination.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

/**
 * Aggregate counters for the Leads page header. Computed server-side over
 * the caller's whole RLS-visible set rather than derived in the browser
 * from the (capped) current page, which would silently under-report the
 * moment a tenant has more leads than one page holds.
 */
export class LeadStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty() newCount!: number;
  @ApiProperty() contacted!: number;
  @ApiProperty() qualified!: number;
  @ApiProperty() converted!: number;
  @ApiProperty() disqualified!: number;
  @ApiProperty({ description: 'Mean score across all matching leads, rounded to a whole number.' })
  averageScore!: number;
  @ApiProperty({ description: 'Converted / total, as a 0-100 percentage rounded to one decimal.' })
  conversionRate!: number;
  @ApiProperty({ description: 'Leads created in the last 7 days.' }) createdLast7Days!: number;
}

export class UpdateLeadScoreDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) score!: number;
}

export class LeadResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() source!: string;
  @ApiProperty({ nullable: true }) sourceCampaign!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) companyName!: string | null;
  @ApiProperty() score!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) assignedToId!: string | null;
  @ApiProperty({ nullable: true }) convertedAccountId!: string | null;
  @ApiProperty({ nullable: true }) convertedOpportunityId!: string | null;
  @ApiProperty({ nullable: true }) qualificationNotes!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) customFields!: unknown;
  @ApiProperty() createdAt!: Date;
}

/**
 * Links to an existing Account when existingAccountId is set; otherwise a
 * new Account is created from accountName (+ optional fields). Exactly one
 * of these two modes applies — validated in LeadsController.convert().
 */
export class ConvertLeadRequestDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() existingAccountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) accountName?: string;
  @ApiProperty({ enum: AccountType, required: false }) @IsOptional() @IsEnum(AccountType) accountType?: AccountType;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() industryId?: string;
  @ApiProperty({ required: false, description: 'Defaults to the lead assignee, then the calling user' })
  @IsOptional()
  @IsUUID()
  accountOwnerId?: string;

  @ApiProperty() @IsString() @MinLength(1) opportunityName!: string;
  @ApiProperty() @IsUUID() pipelineStageId!: string;
  @ApiProperty({ description: 'Decimal amount, e.g. "45000000.00"' }) @IsString() amount!: string;
  @ApiProperty({ required: false, description: 'Defaults to the target stage defaultProbability' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @ApiProperty() @IsDateString() expectedCloseDate!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  @ApiProperty({ required: false, description: 'Defaults to the lead assignee, then the calling user' })
  @IsOptional()
  @IsUUID()
  opportunityOwnerId?: string;
}

export class ConvertLeadResponseDto {
  @ApiProperty() lead!: LeadResponseDto;
  @ApiProperty() accountId!: string;
  @ApiProperty() opportunityId!: string;
}

export class BulkAssignLeadsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() assignedToId!: string;
}

export class BulkUpdateLeadsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ enum: LeadStatus, required: false }) @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @ApiProperty({ required: false, description: 'A LeadSource.code' }) @IsOptional() @IsString() source?: string;
  @ApiProperty({ required: false, minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
}

export class BulkDeleteLeadsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}
