import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PolicyVersionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() versionNumber!: number;
  @ApiProperty() versionType!: string;
  @ApiProperty() effectiveDate!: Date;
  @ApiPropertyOptional() changeDescription?: string | null;
  @ApiPropertyOptional() premiumImpact?: string | null;
  @ApiPropertyOptional() sumInsuredAtVersion?: string | null;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  /** Present only for ENDORSEMENT/CANCELLATION versions — see policy-lifecycle.ts's APPROVAL_GATED_VERSION_TYPES. */
  @ApiPropertyOptional() approvalStatus?: string | null;
  @ApiPropertyOptional() applied?: boolean;
}
