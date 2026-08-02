import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BranchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty({ nullable: true }) city!: string | null;
  @ApiProperty({ nullable: true }) state!: string | null;
  @ApiProperty({ nullable: true }) country!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CreateBranchDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(30) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) country?: string;
}

export class UpdateBranchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(30) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) country?: string;
}
