import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}

export class SiteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) addressLine1!: string | null;
  @ApiProperty({ nullable: true }) addressLine2!: string | null;
  @ApiProperty({ nullable: true }) city!: string | null;
  @ApiProperty({ nullable: true }) state!: string | null;
  @ApiProperty({ nullable: true }) country!: string | null;
  @ApiProperty({ nullable: true }) postalCode!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
