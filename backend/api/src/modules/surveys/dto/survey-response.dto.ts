import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { SurveyResponseChannel } from '@topiadesk/db';

export class SurveyResponseQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() agentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

/**
 * respondToken is never returned by any read endpoint (GET .../responses
 * intentionally omits it below) — it's a bearer credential, not display
 * data; the only place it's checked is submitResponse()'s constant-time
 * compare in surveys.service.ts.
 */
export class SurveyResponseRecordDto {
  @ApiProperty() id!: string;
  @ApiProperty() surveyId!: string;
  @ApiProperty() triggerEntityType!: string;
  @ApiProperty() triggerEntityId!: string;
  @ApiPropertyOptional({ nullable: true }) accountId!: string | null;
  @ApiPropertyOptional({ nullable: true }) respondentContactId!: string | null;
  @ApiPropertyOptional({ nullable: true }) agentId!: string | null;
  @ApiProperty({ enum: SurveyResponseChannel }) channel!: SurveyResponseChannel;
  @ApiPropertyOptional({ nullable: true }) score!: number | null;
  @ApiPropertyOptional({ nullable: true }) comment!: string | null;
  @ApiPropertyOptional({ nullable: true }) sentAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) respondedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class SubmitSurveyResponseDto {
  @ApiProperty({ description: 'The respondToken issued when this response row was created' })
  @IsString()
  @MinLength(1)
  respondToken!: string;
  @ApiProperty() @IsInt() score!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
