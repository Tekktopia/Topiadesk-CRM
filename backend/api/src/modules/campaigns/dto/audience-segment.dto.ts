import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDefined, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';

/**
 * Fixed operator vocabulary the filter compiler understands — see
 * ../segment-filters.ts's SEGMENT_FILTERABLE_FIELDS for which operators are
 * actually allowed per field. Not a class-validator @IsEnum because the
 * allowlist (and per-field operator subset) is the real gate; this DTO only
 * needs `operator` to be a non-empty string to reach that gate.
 */
export class SegmentFilterConditionDto {
  @ApiProperty({ description: 'Field key from the fixed allowlist, e.g. "policy.lineOfBusiness" — see GET /audience-segments/filterable-fields' })
  @IsString()
  @MinLength(1)
  field!: string;

  @ApiProperty({ description: 'One of: eq, neq, gt, gte, lt, lte, in, notIn, contains — subset allowed depends on the field\'s type' })
  @IsString()
  @MinLength(1)
  operator!: string;

  @ApiProperty({ description: 'String/number/date-string/enum value, or an array of those for in/notIn — type-checked server-side against the field\'s allowlisted type' })
  @IsDefined()
  value!: unknown;
}

export class SegmentFilterGroupDto {
  @ApiProperty({ enum: ['ALL', 'ANY'], description: 'ALL = AND (policy/premium/renewal conditions correlate onto the same policy); ANY = OR' })
  @IsIn(['ALL', 'ANY'])
  match!: 'ALL' | 'ANY';

  @ApiProperty({ type: [SegmentFilterConditionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentFilterConditionDto)
  conditions!: SegmentFilterConditionDto[];
}

export class CreateAudienceSegmentDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;

  @ApiProperty({ type: SegmentFilterGroupDto })
  @ValidateNested()
  @Type(() => SegmentFilterGroupDto)
  filters!: SegmentFilterGroupDto;

  @ApiProperty({ required: false, default: true, description: 'Dynamic segments re-evaluate at send time; non-dynamic segments are materialized once, at schedule time' })
  @IsOptional()
  @IsBoolean()
  isDynamic?: boolean;

  @ApiProperty({ required: false, description: 'Defaults to the calling user' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class UpdateAudienceSegmentDto extends PartialType(CreateAudienceSegmentDto) {}

export class AudienceSegmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() filters!: unknown;
  @ApiProperty() isDynamic!: boolean;
  @ApiProperty({ nullable: true }) ownerId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PreviewAudienceSegmentDto {
  @ApiProperty({ type: SegmentFilterGroupDto, required: false, description: 'Override the segment\'s saved filters for a live preview before saving — defaults to the saved filters when omitted' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentFilterGroupDto)
  filters?: SegmentFilterGroupDto;
}

export class SegmentContactSampleDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) accountId!: string | null;
}

export class SegmentPreviewResponseDto {
  @ApiProperty() count!: number;
  @ApiProperty({ type: [SegmentContactSampleDto] }) sample!: SegmentContactSampleDto[];
}
