import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { DataSubjectRequestStatus, DataSubjectRequestType } from '@topiadesk/db';

export class CreateDataSubjectRequestDto {
  @ApiProperty() @IsUUID() contactId!: string;
  @ApiProperty({ enum: DataSubjectRequestType }) @IsEnum(DataSubjectRequestType) requestType!: DataSubjectRequestType;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class RejectDataSubjectRequestDto {
  @ApiProperty() @IsString() @MinLength(1) reason!: string;
}

export class DataSubjectRequestQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional({ enum: DataSubjectRequestStatus }) @IsOptional() @IsEnum(DataSubjectRequestStatus) status?: DataSubjectRequestStatus;
  @ApiPropertyOptional({ enum: DataSubjectRequestType }) @IsOptional() @IsEnum(DataSubjectRequestType) requestType?: DataSubjectRequestType;
}

/**
 * Compliance-queue aggregates.
 *
 * Unlike every other stats endpoint in this codebase, the headline number
 * here is a LEGAL one: a data-subject request has a statutory response
 * deadline (GDPR Art. 12(3) and the NDPR both allow one month), so a PENDING
 * request older than that is a compliance breach, not merely a slow ticket.
 * `overdue` and `dueSoon` exist to make that visible before it happens.
 *
 * DSR_RESPONSE_DEADLINE_DAYS is a named constant rather than an inline 30
 * precisely because it is a policy choice: if legal counsel sets a stricter
 * internal SLA, this is the one place to change it.
 */
export const DSR_RESPONSE_DEADLINE_DAYS = 30;
/** How far ahead of the deadline a still-PENDING request starts warning. */
export const DSR_DUE_SOON_DAYS = 7;

export class DataSubjectRequestStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty() pending!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() rejected!: number;
  @ApiProperty({ description: `PENDING for longer than ${DSR_RESPONSE_DEADLINE_DAYS} days — past the statutory response window.` })
  overdue!: number;
  @ApiProperty({ description: `PENDING and within ${DSR_DUE_SOON_DAYS} days of the deadline.` })
  dueSoon!: number;
  @ApiProperty({ description: 'The deadline in days this endpoint measured against, so the UI never hardcodes it separately.' })
  deadlineDays!: number;
}

export class DataSubjectRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() contactId!: string;
  @ApiProperty({ enum: DataSubjectRequestType }) requestType!: string;
  @ApiProperty({ enum: DataSubjectRequestStatus }) status!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty() requestedById!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) exportData!: unknown;
  @ApiProperty({ nullable: true }) processedById!: string | null;
  @ApiProperty({ nullable: true }) processedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
