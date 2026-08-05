import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * Query params for the public knowledge portal's article list
 * (public-knowledge.controller.ts). Deliberately carries no `status` or
 * `visibility` param, unlike KnowledgeArticleQueryDto (the internal
 * equivalent in knowledge-article.dto.ts) — the public endpoint hardcodes
 * `status: 'PUBLISHED', visibility: 'CUSTOMER'` in the controller itself
 * and must never let a caller override that filter.
 */
export class PublicKnowledgeArticleQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive substring match on title' }) @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) take?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

export class PublicKnowledgeCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

/**
 * Deliberately a much narrower field set than KnowledgeArticleResponseDto
 * (the internal DTO) — no ownerId, no notHelpfulCount, no translationGroupId,
 * no currentVersionId. This is served to anonymous internet traffic; only
 * fields an external visitor has a reason to see are included.
 */
export class PublicKnowledgeArticleListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) categoryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName!: string | null;
  @ApiProperty() viewCount!: number;
  @ApiProperty() helpfulCount!: number;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: Date | null;
}

export class PublicKnowledgeArticleDetailDto extends PublicKnowledgeArticleListItemDto {
  @ApiProperty({ description: "The article's current published version body" }) bodyMarkdown!: string;
  @ApiProperty() updatedAt!: Date;
}
