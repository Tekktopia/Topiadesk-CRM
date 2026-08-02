import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CarrierType } from '@topiadesk/db';

export class CreateCarrierDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: CarrierType }) @IsEnum(CarrierType) carrierType!: CarrierType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() amBestRating?: string;
  @ApiProperty({ required: false, type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) linesOfBusiness?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() panelStatus?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() treatyType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() commissionTerms?: string;
}

export class UpdateCarrierDto extends PartialType(CreateCarrierDto) {}

export class CarrierResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() carrierType!: string;
  @ApiProperty({ nullable: true }) amBestRating!: string | null;
  @ApiProperty({ type: [String] }) linesOfBusiness!: string[];
  @ApiProperty({ nullable: true }) panelStatus!: string | null;
  @ApiProperty({ nullable: true }) treatyType!: string | null;
  @ApiProperty({ nullable: true }) commissionTerms!: string | null;
  @ApiProperty() createdAt!: Date;
}
