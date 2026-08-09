import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class PlatformSearchQueryDto {
  @ApiProperty({ description: 'Search term — matched case-insensitively against each entity type\'s natural-language identifier (name, slug, email, subject, etc).' })
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
 * Kept in sync by hand with the entity types platform-search.controller.ts
 * actually queries — same convention as backend/api/src/modules/search/
 * dto/search.dto.ts's SEARCH_RESULT_TYPES, applied to the platform schema.
 */
export const PLATFORM_SEARCH_RESULT_TYPES = ['TENANT', 'PLAN', 'PLATFORM_ADMIN', 'SUPPORT_TICKET'] as const;
export type PlatformSearchResultType = (typeof PLATFORM_SEARCH_RESULT_TYPES)[number];

export class PlatformSearchResultDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PLATFORM_SEARCH_RESULT_TYPES }) type!: PlatformSearchResultType;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) subtitle!: string | null;
  /** Frontend route to navigate to on selection — same-origin relative path. */
  @ApiProperty() href!: string;
}

export class PlatformSearchResponseDto {
  @ApiProperty({ type: [PlatformSearchResultDto] }) results!: PlatformSearchResultDto[];
}
