import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { INDEXABLE_ENTITY_TYPES, type IndexableEntityType } from '../indexable-entity-types';

export class SemanticIndexRequestDto {
  @ApiProperty({ enum: INDEXABLE_ENTITY_TYPES })
  @IsIn(INDEXABLE_ENTITY_TYPES)
  entityType!: IndexableEntityType;

  @ApiProperty() @IsUUID() entityId!: string;
}

export class SemanticIndexResponseDto {
  @ApiProperty() chunksIndexed!: number;
  @ApiProperty() estimatedCostUsd!: number;
}
