import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ReplyDraftRequestDto {
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty({ description: 'The customer message / interaction text to draft a reply to' })
  @IsString()
  @MinLength(1)
  contextText!: string;
  @ApiPropertyOptional({ description: 'Optional tone/content guidance, e.g. "keep it short", "offer a callback"' })
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class ReplyDraftResponseDto {
  @ApiProperty() draft!: string;
  @ApiProperty() estimatedCostUsd!: number;
}
