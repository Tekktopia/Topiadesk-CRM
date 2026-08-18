import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateIndustryDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentIndustryId?: string;
}

export class UpdateIndustryDto extends PartialType(CreateIndustryDto) {}

export class IndustryQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive name search, powers the Account form\'s industry picker' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class IndustryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) parentIndustryId!: string | null;
}
