import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { KnowledgeArticleStatus, KnowledgeArticleVisibility } from '@topiadesk/db';

/**
 * Creating an article writes its DRAFT row AND version 1 in one call —
 * mirrors DocumentsService.upload() combining Document + DocumentVersion
 * (documents.service.ts). bodyMarkdown here seeds KnowledgeArticleVersion;
 * there is no bare "create an empty article" — an article without content
 * isn't a meaningful DRAFT.
 */
export class CreateKnowledgeArticleDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiProperty() @IsString() @MinLength(1) slug!: string;
  @ApiProperty() @IsString() @MinLength(1) title!: string;
  @ApiPropertyOptional({ enum: KnowledgeArticleVisibility, default: 'INTERNAL' })
  @IsOptional()
  @IsEnum(KnowledgeArticleVisibility)
  visibility?: KnowledgeArticleVisibility;
  @ApiPropertyOptional({ default: 'en' }) @IsOptional() @IsString() locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() translationGroupId?: string;
  @ApiProperty() @IsString() @MinLength(1) bodyMarkdown!: string;
}

export class KnowledgeArticleQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional({ enum: KnowledgeArticleStatus }) @IsOptional() @IsEnum(KnowledgeArticleStatus) status?: KnowledgeArticleStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() locale?: string;
  @ApiPropertyOptional({ enum: KnowledgeArticleVisibility })
  @IsOptional()
  @IsEnum(KnowledgeArticleVisibility)
  visibility?: KnowledgeArticleVisibility;
  @ApiPropertyOptional({ description: 'Case-insensitive substring match on title' }) @IsOptional() @IsString() q?: string;
}

export class KnowledgeArticleResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) categoryId!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: KnowledgeArticleStatus }) status!: KnowledgeArticleStatus;
  @ApiProperty({ enum: KnowledgeArticleVisibility }) visibility!: KnowledgeArticleVisibility;
  @ApiProperty() locale!: string;
  @ApiPropertyOptional({ nullable: true }) translationGroupId!: string | null;
  @ApiPropertyOptional({ nullable: true }) currentVersionId!: string | null;
  @ApiProperty() ownerId!: string;
  @ApiProperty() viewCount!: number;
  @ApiProperty() helpfulCount!: number;
  @ApiProperty() notHelpfulCount!: number;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) archivedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
