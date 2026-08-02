import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

const RENEWAL_STATUSES = ['ON_TRACK', 'AT_RISK', 'IN_PROGRESS', 'RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'] as const;

export class CreateRenewalScheduleDto {
  @ApiProperty() @IsDateString() renewalDueDate!: string;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  alertThresholds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() renewalMeetingDate?: string;
}

/**
 * The user-override surface called out in the brief: reassigning who owns
 * chasing a renewal, and tuning how far out (days) the alert thresholds
 * are. Changing either recomputes `nextAlertDueAt` server-side (see
 * renewal-schedule.controller.ts) — it is not client-settable directly,
 * since an arbitrary client-supplied value could desync it from
 * renewalDueDate/alertThresholds in a way the worker's scan can't reason
 * about.
 */
export class UpdateRenewalScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() renewalDueDate?: string;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  alertThresholds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() renewalMeetingDate?: string;
  @ApiPropertyOptional({ enum: RENEWAL_STATUSES }) @IsOptional() @IsIn(RENEWAL_STATUSES) status?: (typeof RENEWAL_STATUSES)[number];
}
