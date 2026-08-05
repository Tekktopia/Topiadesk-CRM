import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty() @IsUUID() accountId!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsUUID() pipelineStageId!: string;
  @ApiProperty({ description: 'Decimal amount, e.g. "45000000.00"' }) @IsString() amount!: string;
  @ApiProperty({ required: false, description: 'Defaults to the target stage defaultProbability' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @ApiProperty() @IsDateString() expectedCloseDate!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() actualCloseDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wonReason?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lostReason?: string;
  @ApiProperty({ required: false, description: 'Defaults to the calling user' }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  // Validated against active CustomFieldDefinition rows for OPPORTUNITY in
  // OpportunitiesController before write — see custom-fields.validator.ts.
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}

export class OpportunityQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() pipelineId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() pipelineStageId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false, description: 'true = stage.isWon=false AND isLost=false' })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
}

export class UpdateOpportunityStageDto {
  @ApiProperty() @IsUUID() pipelineStageId!: string;
  @ApiProperty({ required: false, description: 'Defaults to the target stage defaultProbability' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() actualCloseDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wonReason?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lostReason?: string;
}

export class OpportunityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() pipelineStageId!: string;
  @ApiProperty({ description: 'Decimal serialized as string' }) amount!: string;
  @ApiProperty() probability!: number;
  @ApiProperty() expectedCloseDate!: Date;
  @ApiProperty({ nullable: true }) actualCloseDate!: Date | null;
  @ApiProperty({ nullable: true }) wonReason!: string | null;
  @ApiProperty({ nullable: true }) lostReason!: string | null;
  @ApiProperty() ownerId!: string;
  @ApiProperty({ nullable: true }) lineOfBusiness!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) customFields!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class BulkAssignOpportunitiesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() ownerId!: string;
}

// pipelineStageId deliberately excluded — stage transitions go through
// PATCH :id/stage so probability stays derived correctly; bulk/update only
// covers fields with no side effects on other columns.
export class BulkUpdateOpportunitiesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wonReason?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lostReason?: string;
}

export class BulkDeleteOpportunitiesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}
