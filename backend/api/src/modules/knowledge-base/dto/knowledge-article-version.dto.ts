import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateKnowledgeArticleVersionDto {
  @ApiProperty() @IsString() @MinLength(1) bodyMarkdown!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() changeNote?: string;
}

export class KnowledgeArticleVersionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() articleId!: string;
  @ApiProperty() versionNumber!: number;
  @ApiProperty() bodyMarkdown!: string;
  @ApiPropertyOptional({ nullable: true }) changeNote!: string | null;
  @ApiProperty() authoredById!: string;
  @ApiProperty() createdAt!: Date;
}
