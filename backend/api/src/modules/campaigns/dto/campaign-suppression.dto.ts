import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CampaignChannel } from '@topiadesk/db';

export class CampaignSuppressionQueryDto {
  @ApiPropertyOptional({ enum: CampaignChannel }) @IsOptional() @IsEnum(CampaignChannel) channel?: CampaignChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 200 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

export class CampaignSuppressionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) contactId!: string | null;
  @ApiProperty() emailOrPhone!: string;
  @ApiProperty({ enum: CampaignChannel }) channel!: CampaignChannel;
  @ApiProperty() reason!: string;
  @ApiProperty() createdAt!: Date;
}
