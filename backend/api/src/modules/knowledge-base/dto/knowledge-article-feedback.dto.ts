import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { KnowledgeFeedbackVote } from '@topiadesk/db';

/** Upserted on (articleId, userId) — see KnowledgeArticlesService.upsertFeedback(). */
export class UpsertKnowledgeArticleFeedbackDto {
  @ApiProperty({ enum: KnowledgeFeedbackVote }) @IsEnum(KnowledgeFeedbackVote) vote!: KnowledgeFeedbackVote;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional({ description: 'Case this article was surfaced against, if any' }) @IsOptional() @IsUUID() caseId?: string;
}

export class KnowledgeArticleFeedbackResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() articleId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: KnowledgeFeedbackVote }) vote!: KnowledgeFeedbackVote;
  @ApiPropertyOptional({ nullable: true }) comment!: string | null;
  @ApiPropertyOptional({ nullable: true }) caseId!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class KnowledgeArticleAnalyticsResponseDto {
  @ApiProperty() articleId!: string;
  @ApiProperty() viewCount!: number;
  @ApiProperty() helpfulCount!: number;
  @ApiProperty() notHelpfulCount!: number;
  @ApiPropertyOptional({ nullable: true, description: 'helpfulCount / (helpfulCount + notHelpfulCount), null if no votes yet' })
  helpfulRatio!: number | null;
}
