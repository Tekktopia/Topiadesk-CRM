import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { SavedViewEntityType, SavedViewVisibility } from '@topiadesk/db';

export class CreateSavedViewDto {
  @ApiProperty({ enum: SavedViewEntityType }) @IsEnum(SavedViewEntityType) entityType!: SavedViewEntityType;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: SavedViewVisibility, required: false, default: 'PRIVATE' })
  @IsOptional()
  @IsEnum(SavedViewVisibility)
  visibility?: SavedViewVisibility;
  @ApiProperty({ required: false, description: 'Required when visibility=TEAM' }) @IsOptional() @IsUUID() teamId?: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Structured filter tree: { op: "AND"|"OR", conditions: [{ field, operator, value }] } — see saved-view-filters.ts for the allowed fields/operators per entityType',
  })
  @IsObject()
  filters!: Record<string, unknown>;
  @ApiProperty({
    required: false,
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Array of { field, direction: "asc"|"desc" }',
  })
  @IsOptional()
  @IsArray()
  sort?: unknown[];
  @ApiProperty({ required: false, type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) columns?: string[];
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isDefault?: boolean;
}

// entityType is deliberately excluded from updates — filters/sort are only
// meaningful against the allowlist for the view's original entityType.
export class UpdateSavedViewDto extends PartialType(CreateSavedViewDto) {}

export class SavedViewQueryDto {
  @ApiProperty({ enum: SavedViewEntityType, required: false }) @IsOptional() @IsEnum(SavedViewEntityType) entityType?: SavedViewEntityType;
}

export class RunSavedViewQueryDto {
  @ApiProperty({ required: false, default: 50 }) @IsOptional() @IsInt() @Min(1) take?: number;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) skip?: number;
}

export class SavedViewResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SavedViewEntityType }) entityType!: string;
  @ApiProperty() name!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty({ enum: SavedViewVisibility }) visibility!: string;
  @ApiProperty({ nullable: true }) teamId!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) filters!: unknown;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true }) sort!: unknown;
  @ApiProperty({ type: [String] }) columns!: string[];
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class RunSavedViewResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ type: [Object] }) rows!: unknown[];
}
