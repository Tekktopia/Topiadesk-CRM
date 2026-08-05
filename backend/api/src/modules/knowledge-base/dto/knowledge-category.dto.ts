import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateKnowledgeCategoryDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiPropertyOptional({ description: 'Parent category — omit for a top-level category' })
  @IsOptional()
  @IsUUID()
  parentCategoryId?: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) order?: number;
}

export class UpdateKnowledgeCategoryDto extends PartialType(CreateKnowledgeCategoryDto) {}

export class KnowledgeCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ nullable: true }) parentCategoryId!: string | null;
  @ApiProperty() order!: number;
  @ApiProperty() createdAt!: Date;
}
