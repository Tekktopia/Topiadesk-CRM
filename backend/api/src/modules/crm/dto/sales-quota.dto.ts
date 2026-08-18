import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBooleanString, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { QuotaPeriodType, QuotaScopeType } from '@topiadesk/db';

export class CreateSalesQuotaDto {
  @ApiProperty({ enum: QuotaScopeType }) @IsEnum(QuotaScopeType) scopeType!: QuotaScopeType;
  // Exactly one of userId/departmentId/branchId must be set, matching
  // scopeType (sales_quotas_scope_target_consistent CHECK constraint,
  // prisma/rls/003_check_constraints.sql) — validated explicitly in the
  // controller for a clean 400, same precedent as Contact's
  // assertExactlyOneParent.
  @ApiProperty({ required: false, description: 'Required when scopeType=USER' }) @IsOptional() @IsUUID() userId?: string;
  @ApiProperty({ required: false, description: 'Required when scopeType=DEPARTMENT' }) @IsOptional() @IsUUID() departmentId?: string;
  @ApiProperty({ required: false, description: 'Required when scopeType=BRANCH' }) @IsOptional() @IsUUID() branchId?: string;
  @ApiProperty({ enum: QuotaPeriodType }) @IsEnum(QuotaPeriodType) periodType!: QuotaPeriodType;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsDateString() periodStart!: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsDateString() periodEnd!: string;
  @ApiProperty({ description: 'Decimal amount, e.g. "5000000.00"' }) @IsString() @MinLength(1) targetAmount!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
}

export class UpdateSalesQuotaDto extends PartialType(CreateSalesQuotaDto) {}

export class SalesQuotaQueryDto {
  @ApiProperty({ enum: QuotaScopeType, required: false }) @IsOptional() @IsEnum(QuotaScopeType) scopeType?: QuotaScopeType;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() userId?: string;
  @ApiProperty({ enum: QuotaPeriodType, required: false }) @IsOptional() @IsEnum(QuotaPeriodType) periodType?: QuotaPeriodType;
  @ApiPropertyOptional({ description: 'Only quotas whose period covers today — the ones actually being measured right now.' })
  @IsOptional()
  @IsBooleanString()
  currentOnly?: string;
}

/**
 * Quota-page aggregates.
 *
 * Deliberately does NOT compute org-wide attainment: that would mean running
 * the per-quota won-opportunity scan (see getAttainment) once per quota on
 * every page load, and each scan is its own filtered Opportunity query. The
 * header reports coverage and committed target instead; attainment stays a
 * per-quota, on-demand figure.
 */
export class SalesQuotaStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Quotas whose periodStart..periodEnd covers today.' }) current!: number;
  @ApiProperty({ description: 'Quotas assigned to an individual rep (scopeType = USER).' }) individual!: number;
  @ApiProperty({ description: 'Sum of targetAmount across CURRENT quotas only — the number being carried this period.' })
  currentTargetTotal!: string;
}

export class SalesQuotaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: QuotaScopeType }) scopeType!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty({ nullable: true }) departmentId!: string | null;
  @ApiProperty({ nullable: true }) branchId!: string | null;
  @ApiProperty({ enum: QuotaPeriodType }) periodType!: string;
  @ApiProperty() periodStart!: Date;
  @ApiProperty() periodEnd!: Date;
  @ApiProperty({ description: 'Decimal serialized as string' }) targetAmount!: string;
  @ApiProperty({ nullable: true }) lineOfBusiness!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class QuotaAttainmentResponseDto {
  @ApiProperty({ description: 'Decimal serialized as string' }) targetAmount!: string;
  @ApiProperty({ description: 'Decimal serialized as string — sum of won Opportunities in the quota\'s period/scope' }) wonAmount!: string;
  @ApiProperty() attainmentPct!: number;
}
