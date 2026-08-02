import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const POLICY_STATUSES = ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'] as const;

/**
 * accountId/carrierId are deliberately not editable here — a policy's
 * account/carrier is set at creation and swapping either post-hoc is not a
 * PATCH-shaped operation for this domain. `status` is optional and, when
 * present, validated against POLICY_STATUS_TRANSITIONS
 * (policy-lifecycle.ts) — this endpoint is for direct/administrative status
 * moves; PolicyVersion creation is the mechanism for endorsement/renewal/
 * cancellation-driven transitions (policy-version.controller.ts).
 */
export class UpdatePolicyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) lineOfBusiness?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() inceptionDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brokerOfRecordId?: string;
  @ApiPropertyOptional({ enum: POLICY_STATUSES }) @IsOptional() @IsIn(POLICY_STATUSES) status?: (typeof POLICY_STATUSES)[number];
}
