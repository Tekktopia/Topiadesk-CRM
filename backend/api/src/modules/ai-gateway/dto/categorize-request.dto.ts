import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CategorizeRequestDto {
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty() @IsString() @MinLength(1) text!: string;
}

/** Advisory only — see ai-gateway.service.ts's header comment; caller applies suggestedCategory explicitly if they agree. */
export class CategorizeResponseDto {
  @ApiProperty() suggestedCategory!: string;
  @ApiProperty({ description: '0 (low confidence) to 1 (high confidence)' }) confidence!: number;
  @ApiProperty() estimatedCostUsd!: number;
}
