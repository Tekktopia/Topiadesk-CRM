import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

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

export class CreatePipelineStageDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsInt() @Min(0) order!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) defaultProbability!: number;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isWon?: boolean;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isLost?: boolean;
}

export class UpdatePipelineStageDto extends PartialType(CreatePipelineStageDto) {}
