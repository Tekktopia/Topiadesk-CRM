import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { CarrierPanelStatus, CarrierType } from '@topiadesk/db';

export class CreateCarrierDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: CarrierType }) @IsEnum(CarrierType) carrierType!: CarrierType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() amBestRating?: string;
  @ApiProperty({ required: false, type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) linesOfBusiness?: string[];
  @ApiProperty({ required: false, enum: CarrierPanelStatus }) @IsOptional() @IsEnum(CarrierPanelStatus) panelStatus?: CarrierPanelStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() treatyType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() commissionTerms?: string;
}

export class UpdateCarrierDto extends PartialType(CreateCarrierDto) {}

export class CarrierQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search across carrier name, A.M. Best rating and treaty type.' })
  @IsOptional()
  @IsString()
  q?: string;
  @ApiPropertyOptional({ enum: CarrierType }) @IsOptional() @IsEnum(CarrierType) carrierType?: CarrierType;
  @ApiPropertyOptional({ enum: CarrierPanelStatus })
  @IsOptional()
  @IsEnum(CarrierPanelStatus)
  panelStatus?: CarrierPanelStatus;
  @ApiPropertyOptional({ description: 'Matches carriers writing this line of business (exact tag match on linesOfBusiness).' })
  @IsOptional()
  @IsString()
  lineOfBusiness?: string;
  @ApiPropertyOptional({ description: 'Max rows to return (default 100).' })
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
 * Panel-level aggregates for the Carriers page header.
 *
 * Distinct from GET /crm/carriers/:id/scorecard, which rates ONE carrier's
 * performance (bind ratio, response time, loss ratio). This answers "what
 * does our panel look like overall" instead, and is the figure a broker
 * reports upward.
 *
 * `totalGrossPremium` is normalized into the org's base currency: Premium
 * carries no currency of its own and inherits Policy.currency, so premium
 * placed across a mixed-currency book cannot be raw-summed.
 */
export class CarrierStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Carriers with panelStatus = ACTIVE.' }) activeOnPanel!: number;
  @ApiProperty({ description: 'Carriers still being evaluated (PROSPECTIVE).' }) prospective!: number;
  @ApiProperty({ description: 'SUSPENDED or TERMINATED — cannot take new business.' }) offPanel!: number;
  @ApiProperty({ description: 'Policies placed with the matching carriers.' }) policiesPlaced!: number;
  @ApiProperty({ description: 'ISO 4217 code totalGrossPremium is expressed in.' }) baseCurrency!: string;
  @ApiProperty({ description: 'Gross premium placed with the matching carriers, in baseCurrency.' })
  totalGrossPremium!: number;
}

export class CarrierResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() carrierType!: string;
  @ApiProperty({ nullable: true }) amBestRating!: string | null;
  @ApiProperty({ type: [String] }) linesOfBusiness!: string[];
  @ApiProperty({ nullable: true, enum: CarrierPanelStatus }) panelStatus!: CarrierPanelStatus | null;
  @ApiProperty({ nullable: true }) treatyType!: string | null;
  @ApiProperty({ nullable: true }) commissionTerms!: string | null;
  @ApiProperty() createdAt!: Date;
}

/** GET /crm/carriers/:id/policies — every Policy written with this carrier, joined with its Account name (mirrors AccountRenewalRowDto's shape/purpose in account-response.dto.ts). */
export class CarrierPolicyRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyNumber!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() lineOfBusiness!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) sumInsured!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty() expiryDate!: Date;
}

/** GET /crm/carriers/:id/market-submissions — every OpportunityMarketSubmission naming this carrier, joined with its Opportunity name. First real consumer of OpportunityMarketSubmission — until now tracked but never surfaced anywhere. */
export class CarrierMarketSubmissionRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() opportunityId!: string;
  @ApiProperty() opportunityName!: string;
  @ApiProperty({ nullable: true }) quotedPremium!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() submittedAt!: Date;
  @ApiProperty({ nullable: true }) respondedAt!: Date | null;
}

/** GET /crm/carriers/:id/scorecard — computed, never stored. Ratios are null (not 0) when there's no underlying data to divide by, so the frontend can render "—" instead of a misleading 0%. */
export class CarrierScorecardDto {
  @ApiProperty() totalSubmissions!: number;
  @ApiProperty() totalBound!: number;
  @ApiProperty({ nullable: true }) bindRatio!: number | null;
  @ApiProperty({ nullable: true }) avgResponseDays!: number | null;
  @ApiProperty({ nullable: true }) totalGrossPremium!: string | null;
  @ApiProperty({ nullable: true }) totalSettledClaims!: string | null;
  @ApiProperty({ nullable: true }) lossRatio!: number | null;
}
