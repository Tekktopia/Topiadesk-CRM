import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsBooleanString, IsDateString, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty() @IsUUID() accountId!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsUUID() pipelineStageId!: string;
  @ApiProperty({ description: 'Decimal amount, e.g. "45000000.00"' }) @IsString() amount!: string;
  @ApiProperty({ required: false, default: 'NGN', description: 'ISO 4217 code — see ExchangeRate for how non-NGN amounts get normalized in dashboard/report totals.' })
  @IsOptional()
  @IsString()
  currency?: string;
  @ApiProperty({ required: false, description: 'Defaults to the target stage defaultProbability' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @ApiProperty() @IsDateString() expectedCloseDate!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() actualCloseDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wonReason?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lostReason?: string;
  @ApiProperty({ required: false, description: 'Defaults to the calling user' }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  // Validated against active CustomFieldDefinition rows for OPPORTUNITY in
  // OpportunitiesController before write — see custom-fields.validator.ts.
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}

export class OpportunityQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() pipelineId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() pipelineStageId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  // String, not boolean: the global pipe's enableImplicitConversion casts a
  // boolean-typed query param with Boolean(), turning the string "false"
  // into `true` and pinning the flag permanently ON. See
  // AccountQueryDto.includeArchived for the full explanation.
  @ApiProperty({ required: false, description: "'true' = stage.isWon=false AND isLost=false" })
  @IsOptional()
  @IsBooleanString()
  isOpen?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  @ApiPropertyOptional({ description: 'Free-text search across the opportunity name.' })
  @IsOptional()
  @IsString()
  q?: string;
  // Amount is Decimal(15,2) in the DB and a string on the wire, but these
  // bounds are plain numbers: they are only ever compared, never persisted,
  // and a JS number covers the realistic deal-size range without the
  // ceremony of parsing a Decimal on a query param.
  @ApiPropertyOptional({ description: 'Lower bound on deal amount, in the deal\'s own currency.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;
  @ApiPropertyOptional({ description: 'Upper bound on deal amount, in the deal\'s own currency.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;
  @ApiPropertyOptional({ description: 'Only deals expected to close on/after this date (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  closeFrom?: string;
  @ApiPropertyOptional({ description: 'Only deals expected to close on/before this date (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  closeTo?: string;
  @ApiPropertyOptional({ description: 'Max rows to return (default 200).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  take?: number;
  @ApiPropertyOptional({ description: 'Rows to skip, for pagination.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

/**
 * Pipeline header aggregates.
 *
 * Every money figure is normalized into the org's BASE_CURRENCY via
 * ExchangeRate (dashboards/currency.util.ts) before being summed —
 * Opportunity.currency is per-row, so a raw SUM(amount) across a mixed
 * NGN/USD pipeline is a meaningless number. `baseCurrency` is returned
 * alongside the totals so the UI can label them honestly rather than
 * guessing.
 */
export class OpportunityStatsResponseDto {
  @ApiProperty({ description: 'ISO 4217 code every *Value field below is expressed in.' })
  baseCurrency!: string;
  @ApiProperty() totalCount!: number;
  @ApiProperty({ description: 'Deals in a stage that is neither won nor lost.' }) openCount!: number;
  @ApiProperty() wonCount!: number;
  @ApiProperty() lostCount!: number;
  @ApiProperty({ description: 'Sum of open deal amounts, base currency.' }) openValue!: number;
  @ApiProperty({ description: 'Sum of open amount x probability/100 — the forecastable figure.' })
  weightedValue!: number;
  @ApiProperty({ description: 'Sum of won deal amounts, base currency.' }) wonValue!: number;
  @ApiProperty({ description: 'won / (won + lost), as a 0-100 percentage rounded to one decimal.' })
  winRate!: number;
  @ApiProperty({ description: 'Mean open deal size, base currency.' }) averageDealSize!: number;
  @ApiProperty({ description: 'Open deals whose expectedCloseDate has already passed.' })
  overdueCount!: number;
}

export class UpdateOpportunityStageDto {
  @ApiProperty() @IsUUID() pipelineStageId!: string;
  @ApiProperty({ required: false, description: 'Defaults to the target stage defaultProbability' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() actualCloseDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wonReason?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lostReason?: string;
}

export class OpportunityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() pipelineStageId!: string;
  @ApiProperty({ description: 'Decimal serialized as string' }) amount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() probability!: number;
  @ApiProperty() expectedCloseDate!: Date;
  @ApiProperty({ nullable: true }) actualCloseDate!: Date | null;
  @ApiProperty({ nullable: true }) wonReason!: string | null;
  @ApiProperty({ nullable: true }) lostReason!: string | null;
  @ApiProperty() ownerId!: string;
  @ApiProperty({ nullable: true }) lineOfBusiness!: string | null;
  /** Composite "on track" signal (overdue-vs-close-date + activity staleness) — see refresh-deal-health.job.ts. Null for closed deals or before the first scoring run. Distinct from `probability`. */
  @ApiProperty({ nullable: true }) dealHealthScore!: number | null;
  @ApiProperty({ nullable: true }) dealHealthScoreComputedAt!: Date | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) customFields!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** One stage transition, resolved from the audit log's changed_fields.pipeline_stage_id diff — see OpportunitiesController.stageHistory(). */
export class StageHistoryEntryDto {
  @ApiProperty() changedAt!: Date;
  @ApiProperty({ nullable: true }) actorName!: string | null;
  @ApiProperty({ nullable: true }) fromStageId!: string | null;
  @ApiProperty({ nullable: true }) fromStageName!: string | null;
  @ApiProperty({ nullable: true }) toStageId!: string | null;
  @ApiProperty({ nullable: true }) toStageName!: string | null;
}

export class BulkAssignOpportunitiesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() ownerId!: string;
}

// pipelineStageId deliberately excluded — stage transitions go through
// PATCH :id/stage so probability stays derived correctly; bulk/update only
// covers fields with no side effects on other columns.
export class BulkUpdateOpportunitiesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wonReason?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lostReason?: string;
}

export class BulkDeleteOpportunitiesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}
