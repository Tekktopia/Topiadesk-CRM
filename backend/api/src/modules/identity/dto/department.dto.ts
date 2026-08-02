import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class DepartmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ nullable: true }) parentDepartmentId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CreateDepartmentDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(30) code!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() parentDepartmentId?: string | null;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(30) code?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() parentDepartmentId?: string | null;
}
