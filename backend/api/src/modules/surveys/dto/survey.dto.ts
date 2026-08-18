import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SurveyTriggerEvent, SurveyType } from '@topiadesk/db';

export class CreateSurveyDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: SurveyType }) @IsEnum(SurveyType) type!: SurveyType;
  @ApiProperty({ enum: SurveyTriggerEvent }) @IsEnum(SurveyTriggerEvent) triggerEvent!: SurveyTriggerEvent;
  @ApiProperty() @IsString() @MinLength(1) questionText!: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) scaleMin?: number;
  @ApiProperty() @IsInt() @Min(1) scaleMax!: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ default: 0, description: 'Minutes to wait after the trigger event before dispatching' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sendDelayMinutes?: number;
}

export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {}

export class SurveyQueryDto {
  @ApiPropertyOptional({ enum: SurveyType }) @IsOptional() @IsEnum(SurveyType) type?: SurveyType;
  // String, not boolean: the global pipe's enableImplicitConversion casts a
  // boolean-typed query param with Boolean(), turning the string "false"
  // into `true` and pinning the flag permanently ON. See
  // AccountQueryDto.includeArchived for the full explanation.
  @ApiPropertyOptional({ description: "'true' / 'false'" }) @IsOptional() @IsBooleanString() isActive?: string;
}

/**
 * Named SurveyDto (not the strict `<Model>ResponseDto` most controllers in
 * this codebase use, e.g. PolicyResponseDto) deliberately — the DB model
 * this represents shares its name with a wholly different model,
 * SurveyResponse (the individual CSAT/NPS answer). `SurveyResponseDto`
 * would read as a DTO for that other model; survey-response.dto.ts's
 * `SurveyResponseRecordDto` is the actual DTO for SurveyResponse rows.
 */
export class SurveyDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: SurveyType }) type!: SurveyType;
  @ApiProperty({ enum: SurveyTriggerEvent }) triggerEvent!: SurveyTriggerEvent;
  @ApiProperty() questionText!: string;
  @ApiProperty() scaleMin!: number;
  @ApiProperty() scaleMax!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sendDelayMinutes!: number;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
