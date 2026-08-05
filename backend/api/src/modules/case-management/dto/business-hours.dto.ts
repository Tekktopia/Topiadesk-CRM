import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type { WeeklyHours } from '../business-hours.util';

/**
 * weeklyHours shape: `{ mon?: {start:"09:00", end:"17:00"} | null, tue?: ..., ... sun?: ... }`
 * (see business-hours.util.ts's WeeklyHours/DayWindow types) — a day
 * missing from the object, or explicitly null, is closed all day. One
 * window per day only (no split shifts). Kept as a loosely-validated Json
 * object here (IsObject only) rather than deep per-day validation, matching
 * SavedView.filters' own "interpreted server-side" precedent — malformed
 * entries are simply treated as closed by addBusinessMinutes, never as an
 * open-ended query risk.
 */
export class CreateBusinessHoursCalendarDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsString() @MinLength(1) timezone!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) @IsObject() weeklyHours!: WeeklyHours;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateBusinessHoursCalendarDto extends PartialType(CreateBusinessHoursCalendarDto) {}

export class BusinessHoursCalendarResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() timezone!: string;
  /** Prisma reads this Json column back as Prisma.JsonValue, not the narrower WeeklyHours the create/update DTOs accept — typed loosely here rather than cast at every controller return site. */
  @ApiProperty({ type: 'object', additionalProperties: true }) weeklyHours!: unknown;
  @ApiProperty() isDefault!: boolean;
}

export class CreateBusinessHolidayDto {
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
}

export class UpdateBusinessHolidayDto extends PartialType(CreateBusinessHolidayDto) {}

export class BusinessHolidayResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() calendarId!: string;
  @ApiProperty() date!: Date;
  @ApiProperty() name!: string;
}
