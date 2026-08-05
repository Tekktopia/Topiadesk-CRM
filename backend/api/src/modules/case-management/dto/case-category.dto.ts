import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CaseType } from '@topiadesk/db';

export class CreateCaseCategoryDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiPropertyOptional({ enum: CaseType, description: 'Restricts this category to one CaseType — omit for a category usable across all types' })
  @IsOptional()
  @IsEnum(CaseType)
  caseType?: CaseType;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Parent category id, for a nested hierarchy — omit/null for a top-level category. Must not be the category itself or one of its own descendants (cycle check is client-side; see case-categories-list-view.tsx / case-category-form-dialog.tsx). The controller rejects self-parenting.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCaseCategoryDto extends PartialType(CreateCaseCategoryDto) {}

export class CaseCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ nullable: true }) caseType!: string | null;
  @ApiProperty({ nullable: true }) parentId!: string | null;
}
