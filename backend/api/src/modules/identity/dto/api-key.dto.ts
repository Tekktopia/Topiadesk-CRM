import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'What this key is for, e.g. "Zapier integration" — shown in the list so you can tell your keys apart.' })
  @IsString()
  @MinLength(1)
  name!: string;
  @ApiPropertyOptional({ description: 'Omit for a key that never expires.' }) @IsOptional() @IsDateString() expiresAt?: string;
}

export class ApiKeyResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() tokenLastFour!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true }) lastUsedAt!: Date | null;
  @ApiProperty({ nullable: true }) expiresAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

/** POST response only — the one and only time the raw key is ever returned. */
export class ApiKeyCreatedResponseDto extends ApiKeyResponseDto {
  @ApiProperty({ description: 'The raw bearer key — copy it now, it is never shown again.' }) token!: string;
}
