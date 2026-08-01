import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class SummarizeRequestDto {
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty() @IsString() @MinLength(1) text!: string;
}

export class SummarizeResponseDto {
  @ApiProperty() summary!: string;
  @ApiProperty() estimatedCostUsd!: number;
}
