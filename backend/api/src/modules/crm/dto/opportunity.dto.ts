import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

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
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
