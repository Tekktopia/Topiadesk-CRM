import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { KnowledgeFeedbackVote } from '@topiadesk/db';

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

/**
 * Anonymous "was this helpful?" vote — deliberately NOT the internal
 * KnowledgeArticleFeedback table (KnowledgeArticlesService.upsertFeedback()):
 * that model's `userId` is a required FK to the internal `users` table, so
 * it has no identity to record an anonymous public visitor or portal
 * Contact against. This is a bare increment on the same denormalized
 * `helpfulCount`/`notHelpfulCount` columns the public list/detail DTOs
 * already surface — no per-visitor uniqueness enforced server-side, same
 * "fire-and-forget, no dedup" posture as this controller's own viewCount
 * increment (findBySlug()). A future login-gated Portal-only "one vote per
 * contact" version is a real possible follow-up, not this pass's job.
 */
export class PublicKnowledgeArticleFeedbackDto {
  @ApiProperty({ enum: KnowledgeFeedbackVote }) @IsEnum(KnowledgeFeedbackVote) vote!: KnowledgeFeedbackVote;
}

export class PublicKnowledgeArticleFeedbackResponseDto {
  @ApiProperty() helpfulCount!: number;
}
