import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreatePipelineDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePipelineDto extends PartialType(CreatePipelineDto) {}

export class PipelineStageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() pipelineId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() order!: number;
  @ApiProperty() defaultProbability!: number;
  @ApiProperty() isWon!: boolean;
  @ApiProperty() isLost!: boolean;
}

export class PipelineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) lineOfBusiness!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class PipelineDetailResponseDto extends PipelineResponseDto {
  @ApiProperty({ type: [PipelineStageResponseDto] }) stages!: PipelineStageResponseDto[];
}

/**
 * How much live work sits on one pipeline's stages.
 *
 * This exists because pipeline config is destructive in a way the setup page
 * gave no warning about: `opportunities.pipeline_stage_id` is ON DELETE
 * RESTRICT, so deleting a stage (or a pipeline, which cascades into its
 * stages) that still holds deals fails at the database. The page needs the
 * counts BEFORE the admin clicks delete, not an error afterwards.
 *
 * `openValue` is currency-normalized into the org's base currency, same as
 * the pipeline board's own stats — Opportunity.currency is per-row, so a raw
 * sum across a mixed-currency stage would be meaningless.
 */
export class PipelineStageUsageDto {
  @ApiProperty() stageId!: string;
  @ApiProperty() stageName!: string;
  @ApiProperty({ description: 'Opportunities currently sitting in this stage — blocks deletion when > 0.' })
  opportunityCount!: number;
  @ApiProperty({ description: 'Sum of those deals, in baseCurrency.' }) openValue!: number;
}

export class PipelineUsageResponseDto {
  @ApiProperty() pipelineId!: string;
  @ApiProperty({ description: 'ISO 4217 code every value figure is expressed in.' }) baseCurrency!: string;
  @ApiProperty({ description: 'Deals across every stage of this pipeline.' }) totalOpportunities!: number;
  @ApiProperty({ description: 'Sum across every stage, in baseCurrency.' }) totalValue!: number;
  @ApiProperty({ type: [PipelineStageUsageDto] }) stages!: PipelineStageUsageDto[];
}

export class CreatePipelineStageDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsInt() @Min(0) order!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) defaultProbability!: number;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isWon?: boolean;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isLost?: boolean;
}

export class UpdatePipelineStageDto extends PartialType(CreatePipelineStageDto) {}

/** Stage ids for one pipeline, in the desired display order — see PipelinesController.reorderStages(). */
export class ReorderPipelineStagesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true }) stageIds!: string[];
}
