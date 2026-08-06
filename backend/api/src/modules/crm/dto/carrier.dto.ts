import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
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
