import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class SentimentRequestDto {
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty() @IsString() @MinLength(1) text!: string;
}

/**
 * Advisory only — see ai-gateway.service.ts's header comment. This never
 * gets written to Activity.aiSentiment/aiSentimentScore/aiAnalyzedAt (those
 * columns exist on the schema for a future explicit "apply this suggestion"
 * write, not for this endpoint to populate silently).
 */
export class SentimentResponseDto {
  @ApiProperty({ enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] }) label!: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  @ApiProperty({ description: 'Sentiment polarity, -1 (very negative) to 1 (very positive)' }) score!: number;
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] }) escalationRisk!: 'LOW' | 'MEDIUM' | 'HIGH';
  @ApiProperty({ type: [String] }) keyPhrases!: string[];
  @ApiProperty() estimatedCostUsd!: number;
}
