import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PremiumResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyId!: string;
  @ApiPropertyOptional() policyVersionId?: string | null;
  @ApiProperty() grossPremium!: string;
  @ApiProperty() netPremium!: string;
  @ApiPropertyOptional() commissionRate?: string | null;
  @ApiPropertyOptional() commissionAmount?: string | null;
  @ApiPropertyOptional() installmentPlan?: string | null;
  @ApiProperty() dueDate!: Date;
  @ApiProperty() paidAmount!: string;
  @ApiPropertyOptional() paidDate?: Date | null;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** POST /premiums/:id/paystack/initialize — PaystackService.initializePremiumPayment's stub response shape (a real integration returns these same two fields from Paystack's own /transaction/initialize call). */
export class PaystackInitializeResponseDto {
  @ApiProperty() reference!: string;
  @ApiProperty() authorizationUrl!: string;
}

/** Row shape of `premium_aging_summary_scoped` (prisma/rls/004_reporting_views.sql), camelCased. */
export class PremiumAgingRowDto {
  @ApiProperty() premiumId!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() grossPremium!: string;
  @ApiProperty() paidAmount!: string;
  @ApiProperty() outstandingAmount!: string;
  @ApiProperty() dueDate!: Date;
  @ApiProperty() status!: string;
  @ApiProperty() daysOverdue!: number;
  @ApiProperty() agingBucket!: string;
  @ApiProperty() refreshedAt!: Date;
}
