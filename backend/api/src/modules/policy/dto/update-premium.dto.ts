import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const PREMIUM_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] as const;

/**
 * The common case is "record a payment" (paidAmount/paidDate/status), but
 * the other commercial terms are editable too — installment plans and
 * commission terms routinely get corrected after entry.
 */
export class UpdatePremiumDto {
  @ApiPropertyOptional() @IsOptional() @IsString() grossPremium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() netPremium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commissionRate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commissionAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() installmentPlan?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paidAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paidDate?: string;
  @ApiPropertyOptional({ enum: PREMIUM_STATUSES }) @IsOptional() @IsIn(PREMIUM_STATUSES) status?: (typeof PREMIUM_STATUSES)[number];
}
