import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ProducerCommissionStatus } from '@topiadesk/db';

/**
 * VAT/WHT are captured as explicit amounts, not an auto-applied global rate
 * — Nigerian VAT/WHT rates are a finance/tax configuration decision out of
 * scope here; whoever creates the commission record enters the real
 * withheld amounts. commissionNumber is user-supplied, same convention as
 * Policy.policyNumber/Claim.claimNumber elsewhere in this codebase.
 */
export class CreateProducerCommissionDto {
  @ApiProperty() @IsString() @MinLength(1) commissionNumber!: string;
  @ApiProperty() @IsUUID() policyId!: string;
  @ApiProperty() @IsUUID() producerId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() premiumId?: string;
  @ApiProperty() @IsString() premiumBase!: string;
  @ApiProperty() @IsString() commissionPercent!: string;
  @ApiProperty() @IsString() commissionAmount!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vatAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() whtAmount?: string;
  @ApiProperty() @IsString() netPayable!: string;
  @ApiProperty() @IsString() period!: string;
}

/** The common case is a status transition (PENDING -> APPROVED -> PAID, with paymentDate set on the PAID move), but the underlying commercial figures stay correctable too — same shape as UpdatePremiumDto. */
export class UpdateProducerCommissionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() premiumBase?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commissionPercent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commissionAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vatAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() whtAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() netPayable?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional({ enum: ProducerCommissionStatus }) @IsOptional() @IsEnum(ProducerCommissionStatus) status?: ProducerCommissionStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paymentDate?: string;
}

export class ProducerCommissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() commissionNumber!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() producerId!: string;
  @ApiProperty({ nullable: true }) premiumId!: string | null;
  @ApiProperty() premiumBase!: string;
  @ApiProperty() commissionPercent!: string;
  @ApiProperty() commissionAmount!: string;
  @ApiProperty() vatAmount!: string;
  @ApiProperty() whtAmount!: string;
  @ApiProperty() netPayable!: string;
  @ApiProperty({ enum: ProducerCommissionStatus }) status!: ProducerCommissionStatus;
  @ApiProperty() period!: string;
  @ApiProperty({ nullable: true }) paymentDate!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
