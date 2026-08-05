import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MinLength } from 'class-validator';
import { INDEXABLE_ENTITY_TYPES, type IndexableEntityType } from '../indexable-entity-types';

export class SemanticSearchRequestDto {
  @ApiProperty() @IsString() @MinLength(1) query!: string;

  @ApiPropertyOptional({ enum: INDEXABLE_ENTITY_TYPES, isArray: true, description: 'Restrict to these entity types; omit to search all indexable types' })
  @IsOptional()
  @IsIn(INDEXABLE_ENTITY_TYPES, { each: true })
  entityTypes?: IndexableEntityType[];

  @ApiPropertyOptional({ default: 10 }) @IsOptional() @IsInt() @Max(50) limit?: number;
}

export class SemanticSearchResultDto {
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty() snippet!: string;
  @ApiProperty({ description: 'Cosine similarity, 0 (unrelated) to 1 (identical)' }) score!: number;
}

export class SemanticSearchResponseDto {
  @ApiProperty({ type: [SemanticSearchResultDto] }) results!: SemanticSearchResultDto[];
  @ApiProperty() estimatedCostUsd!: number;
}
