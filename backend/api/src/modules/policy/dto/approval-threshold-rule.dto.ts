import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const VERSION_TYPES = ['ISSUANCE', 'ENDORSEMENT', 'RENEWAL', 'CANCELLATION', 'REINSTATEMENT'] as const;

/**
 * "If a PolicyVersion of this type carries an amount at or above minAmount,
 * require requiredApprovals distinct approvals instead of 1" — only
 * ENDORSEMENT/CANCELLATION are ever actually gated (see
 * policy-lifecycle.ts's APPROVAL_GATED_VERSION_TYPES), so a rule for
 * ISSUANCE/RENEWAL/REINSTATEMENT is accepted but never evaluated — not
 * rejected outright, since an admin pre-configuring rules ahead of a future
 * policy change to gate one of those types isn't unreasonable.
 */
export class CreateApprovalThresholdRuleDto {
  @ApiProperty({ enum: VERSION_TYPES }) @IsIn(VERSION_TYPES) versionType!: (typeof VERSION_TYPES)[number];
  @ApiPropertyOptional({ description: 'Omit for a catch-all rule (no minimum amount).' })
  @IsOptional()
  @IsString()
  minAmount?: string;
  @ApiProperty({ default: 1 }) @IsInt() @Min(1) requiredApprovals!: number;
}

export class UpdateApprovalThresholdRuleDto extends PartialType(CreateApprovalThresholdRuleDto) {}

export class ApprovalThresholdRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() versionType!: string;
  @ApiProperty({ nullable: true }) minAmount!: string | null;
  @ApiProperty() requiredApprovals!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
