import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ActivityDirection, ActivityType } from '@topiadesk/db';

export class CreateActivityDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() contactId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() leadId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() policyId?: string;
  @ApiProperty({ enum: ActivityType }) @IsEnum(ActivityType) type!: ActivityType;
  @ApiProperty({ enum: ActivityDirection }) @IsEnum(ActivityDirection) direction!: ActivityDirection;
  @ApiProperty() @IsString() @MinLength(1) subject!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() body?: string;
  @ApiProperty() @IsDateString() occurredAt!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) durationMinutes?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() outcome?: string;
}

export class ActivityQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() leadId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() policyId?: string;
  @ApiProperty({ enum: ActivityType, required: false }) @IsOptional() @IsEnum(ActivityType) type?: ActivityType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() caseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() claimId?: string;
  /** Whose activity — the filter a manager reviewing their team actually needs. */
  @ApiPropertyOptional({ description: 'Only activities logged by this user.' })
  @IsOptional()
  @IsUUID()
  createdById?: string;
  @ApiPropertyOptional({ enum: ActivityDirection })
  @IsOptional()
  @IsEnum(ActivityDirection)
  direction?: ActivityDirection;
  @ApiPropertyOptional({ description: 'ISO date — activities occurring on or after this instant.' })
  @IsOptional()
  @IsDateString()
  occurredFrom?: string;
  @ApiPropertyOptional({ description: 'ISO date — activities occurring on or before this instant.' })
  @IsOptional()
  @IsDateString()
  occurredTo?: string;
  @ApiPropertyOptional({ description: 'Case-insensitive substring match on subject or body.' })
  @IsOptional()
  @IsString()
  q?: string;
  @ApiPropertyOptional({ default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

/**
 * A CORRECTION, not a general-purpose edit.
 *
 * The controller's header states the standing rule — an activity records
 * something that happened and is not a mutable draft — and that rule stays.
 * What it left no room for is the ordinary clerical case: a call logged
 * against the wrong client, or a typo in the note, which previously stayed
 * wrong permanently.
 *
 * So the mutable set is deliberately narrow. `type` and `direction` are NOT
 * editable: an OUTBOUND email activity is what satisfies a Case's
 * FIRST_RESPONSE SLA clock, and letting someone flip that after the fact
 * would rewrite SLA history. `occurredAt` is editable because mis-dating a
 * genuine interaction is exactly the clerical error this exists to fix.
 */
export class UpdateActivityDto {
  @ApiPropertyOptional({ description: 'Re-link to the correct account. Null detaches.' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leadId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() opportunityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() policyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() occurredAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() outcome?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMinutes?: number;
}

/**
 * Team-activity aggregates.
 *
 * `loggedByPeople` is the number a branch manager reads first: how many of
 * their team actually recorded anything in the window. A high activity count
 * spread across two people is a very different picture from the same count
 * across twelve, and a total alone hides that completely.
 */
export class ActivityStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Inbound interactions (customer reached us).' }) inbound!: number;
  @ApiProperty({ description: 'Outbound interactions (we reached the customer).' }) outbound!: number;
  @ApiProperty({ description: 'Distinct users who logged anything in this view.' }) loggedByPeople!: number;
  @ApiProperty({ description: 'Distinct accounts touched.' }) accountsTouched!: number;
  @ApiProperty({ description: 'Logged automatically by an integration rather than a person.' })
  systemLogged!: number;
}

export class ActivityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) accountId!: string | null;
  @ApiProperty({ nullable: true }) contactId!: string | null;
  @ApiProperty({ nullable: true }) leadId!: string | null;
  @ApiProperty({ nullable: true }) opportunityId!: string | null;
  @ApiProperty({ nullable: true }) policyId!: string | null;
  @ApiProperty() type!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ nullable: true }) body!: string | null;
  @ApiProperty() occurredAt!: Date;
  // Nullable: activities.createdById is optional in the schema to allow
  // system/automation-generated activities with no human actor (see
  // Activity.createdBySystemJob) — this DTO previously required a string,
  // pre-existing drift from that schema change, corrected here.
  @ApiProperty({ nullable: true }) createdById!: string | null;
  @ApiProperty({ nullable: true }) durationMinutes!: number | null;
  @ApiProperty({ nullable: true }) outcome!: string | null;
  @ApiProperty() createdAt!: Date;
  /**
   * Set only once a message has actually gone over the wire (outbound send)
   * or arrived from outside (inbound email/WhatsApp). Exposed so clients can
   * tell a transmitted message from a manual log entry — the API refuses to
   * edit or delete the former, and a UI that offered the action anyway would
   * only ever produce a 403.
   */
  @ApiProperty({ nullable: true }) externalMessageId!: string | null;
}
