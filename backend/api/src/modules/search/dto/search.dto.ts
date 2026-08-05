import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ description: 'Search term — matched case-insensitively against each entity type\'s natural-language identifier (name, number, subject, etc).' })
  @IsString()
  @MinLength(2)
  q!: string;

  @ApiProperty({ required: false, default: 5, description: 'Max results returned per entity type, not a total cap.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

/**
 * Kept in sync by hand with the entity types the search service actually
 * queries (search.controller.ts) — there is no single Prisma enum spanning
 * these, since they're genuinely different models.
 */
export const SEARCH_RESULT_TYPES = [
  'ACCOUNT',
  'CONTACT',
  'LEAD',
  'OPPORTUNITY',
  'CARRIER',
  'TASK',
  'POLICY',
  'CLAIM',
  'CASE',
  'CAMPAIGN',
  'KNOWLEDGE_ARTICLE',
] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export class SearchResultDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SEARCH_RESULT_TYPES }) type!: SearchResultType;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) subtitle!: string | null;
  /** Frontend route to navigate to on selection — same-origin relative path. */
  @ApiProperty() href!: string;
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] }) results!: SearchResultDto[];
}
