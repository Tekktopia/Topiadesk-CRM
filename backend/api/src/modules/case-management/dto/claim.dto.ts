import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { CasePriority, ClaimStatus } from '@topiadesk/db';

export class CreateClaimDto {
  @ApiProperty() @IsString() @MinLength(1) claimNumber!: string;
  @ApiProperty() @IsUUID() policyId!: string;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiProperty() @IsDateString() dateOfLoss!: string;
  @ApiPropertyOptional({ description: 'Defaults to today' }) @IsOptional() @IsDateString() dateReported?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() causeOfLoss?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() causeOfLossCategoryId?: string;
  @ApiPropertyOptional({ description: 'Decimal amount, e.g. "500000.00"' }) @IsOptional() @IsString() reserveAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() adjusterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedTeamId?: string;
  @ApiPropertyOptional({ description: 'Explicit SlaPolicy override — otherwise resolved automatically by entityType/priority' })
  @IsOptional()
  @IsUUID()
  slaPolicyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() catastropheEventId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentClaimId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalAdjusterRef?: string;
}

class ClaimMutableFieldsDto {
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiPropertyOptional() @IsOptional() @IsString() causeOfLoss?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() causeOfLossCategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reserveAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() settledAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() repudiationReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() adjusterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedTeamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() catastropheEventId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalAdjusterRef?: string;
}

/**
 * status is deliberately absent — the build brief gives Claim its own
 * dedicated POST :id/status endpoint (unlike Policy, which folds status
 * into its PATCH), so this module keeps status changes exclusively on that
 * path where CLAIM_STATUS_TRANSITIONS validation and the ClaimStatusHistory
 * write always run. claimNumber/policyId are immutable post-creation,
 * matching UpdatePolicyDto's precedent for accountId/carrierId.
 */
export class UpdateClaimDto extends PartialType(ClaimMutableFieldsDto) {}

export class ClaimQueryDto {
  @ApiPropertyOptional({ enum: ClaimStatus }) @IsOptional() @IsEnum(ClaimStatus) status?: ClaimStatus;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() adjusterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() policyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedTeamId?: string;
  @ApiPropertyOptional({ description: 'Free-text search across claim number and cause of loss.' })
  @IsOptional()
  @IsString()
  q?: string;
  @ApiPropertyOptional({ description: 'Only claims whose catastrophe event is this one — the "how exposed are we to this storm" filter.' })
  @IsOptional()
  @IsUUID()
  catastropheEventId?: string;
  @ApiPropertyOptional({ description: 'Date of loss on/after this date (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  lossFrom?: string;
  @ApiPropertyOptional({ description: 'Date of loss on/before this date (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  lossTo?: string;
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
 * Claims-desk aggregates.
 *
 * The two money figures are the ones a claims manager is actually asked
 * about: outstanding RESERVE (money set aside but not yet paid — the live
 * exposure) and SETTLED (money actually paid out). They are deliberately
 * separate rather than combined into one "total", because they mean opposite
 * things on a balance sheet.
 *
 * Both are normalized into the org's base currency: Claim carries no
 * currency column and inherits Policy.currency, so a mixed-currency book
 * cannot be raw-summed.
 *
 * `open` excludes the three terminal states (SETTLED / REPUDIATED /
 * WITHDRAWN). REOPENED is deliberately counted as open — a reopened claim is
 * live work again, which is the whole point of reopening it.
 */
export class ClaimStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Not SETTLED, REPUDIATED or WITHDRAWN — REOPENED counts as open.' }) open!: number;
  @ApiProperty() settled!: number;
  @ApiProperty() repudiated!: number;
  @ApiProperty({ description: 'Claims that have been reopened at least once.' }) reopened!: number;
  @ApiProperty({ description: 'ISO 4217 code both money figures are expressed in.' }) baseCurrency!: string;
  @ApiProperty({ description: 'Sum of reserveAmount on OPEN claims — live exposure, in baseCurrency.' })
  outstandingReserve!: number;
  @ApiProperty({ description: 'Sum of settledAmount across settled claims, in baseCurrency.' })
  totalSettled!: number;
}

export class ChangeClaimStatusDto {
  @ApiProperty({ enum: ClaimStatus }) @IsEnum(ClaimStatus) status!: ClaimStatus;
  @ApiPropertyOptional({ description: 'Recorded on ClaimStatusHistory; also stored as repudiationReason when status is REPUDIATED' })
  @IsOptional()
  @IsString()
  reason?: string;
  @ApiPropertyOptional({ description: 'Decimal amount — set when status is SETTLED' }) @IsOptional() @IsString() settledAmount?: string;
}

export class ReopenClaimDto {
  @ApiProperty({ description: 'Why this settled/repudiated claim is being reopened' }) @IsString() @MinLength(1) reason!: string;
}

export class ClaimResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() claimNumber!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty() dateOfLoss!: Date;
  @ApiProperty() dateReported!: Date;
  @ApiProperty({ nullable: true }) causeOfLoss!: string | null;
  @ApiProperty({ nullable: true }) causeOfLossCategoryId!: string | null;
  @ApiProperty({ nullable: true }) reserveAmount!: string | null;
  @ApiProperty({ nullable: true }) settledAmount!: string | null;
  @ApiProperty({ nullable: true }) settledAt!: Date | null;
  @ApiProperty({ nullable: true }) repudiationReason!: string | null;
  @ApiProperty({ nullable: true }) adjusterId!: string | null;
  @ApiProperty({ nullable: true }) assignedTeamId!: string | null;
  @ApiProperty({ nullable: true }) slaPolicyId!: string | null;
  @ApiProperty({ nullable: true }) catastropheEventId!: string | null;
  @ApiProperty({ nullable: true }) parentClaimId!: string | null;
  @ApiProperty({ nullable: true }) externalAdjusterRef!: string | null;
  @ApiProperty() reopenCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ClaimStatusHistoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() claimId!: string;
  @ApiProperty({ nullable: true }) fromStatus!: string | null;
  @ApiProperty() toStatus!: string;
  @ApiProperty({ nullable: true }) changedById!: string | null;
  @ApiProperty({ nullable: true }) reason!: string | null;
  @ApiProperty() createdAt!: Date;
}

/** Claims have no delete endpoint at all — bulk actions are assign (adjuster) + status-update only, same shape/reasoning as BulkAssignCasesDto/BulkUpdateCasesDto in case.dto.ts. */
export class BulkAssignClaimsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() adjusterId!: string;
}

export class BulkUpdateClaimsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ enum: ClaimStatus }) @IsEnum(ClaimStatus) status!: ClaimStatus;
}
