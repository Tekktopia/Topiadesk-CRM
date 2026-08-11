import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AssetType } from '@topiadesk/db';

export class CreatePolicyAssetDto {
  @ApiProperty({ enum: AssetType }) @IsEnum(AssetType) assetType!: AssetType;
  @ApiProperty() @IsString() @MinLength(1) assetName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chassisNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() valuation?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() year?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() makeModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() latitude?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() longitude?: string;
}

export class UpdatePolicyAssetDto {
  @ApiPropertyOptional({ enum: AssetType }) @IsOptional() @IsEnum(AssetType) assetType?: AssetType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) assetName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chassisNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() valuation?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() year?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() makeModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() latitude?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() longitude?: string;
}

export class PolicyAssetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty({ enum: AssetType }) assetType!: AssetType;
  @ApiProperty() assetName!: string;
  @ApiProperty({ nullable: true }) registrationNo!: string | null;
  @ApiProperty({ nullable: true }) chassisNo!: string | null;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty({ nullable: true }) valuation!: string | null;
  @ApiProperty({ nullable: true }) year!: number | null;
  @ApiProperty({ nullable: true }) makeModel!: string | null;
  @ApiProperty({ nullable: true }) latitude!: string | null;
  @ApiProperty({ nullable: true }) longitude!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
