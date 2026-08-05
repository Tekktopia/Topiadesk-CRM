import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateLossCauseCategoryDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Parent category id, for a nested hierarchy — omit/null for a top-level category. Must not be the category itself or one of its own descendants (cycle check is client-side; see loss-cause-categories-list-view.tsx / loss-cause-category-form-dialog.tsx). The controller rejects self-parenting.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateLossCauseCategoryDto extends PartialType(CreateLossCauseCategoryDto) {}

export class LossCauseCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ nullable: true }) parentId!: string | null;
}
