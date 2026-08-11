import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertMicrosoftSsoDto {
  @ApiProperty({ description: 'Azure AD (Entra ID) Directory (tenant) ID' }) @IsString() @MinLength(1) azureTenantId!: string;
  @ApiProperty({ description: 'Azure App Registration Application (client) ID' }) @IsString() @MinLength(1) azureClientId!: string;
  @ApiPropertyOptional({ description: 'Omit to keep the currently stored secret unchanged (e.g. toggling isEnabled without retyping it)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  azureClientSecret?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isEnabled?: boolean;
}

export class MicrosoftSsoResponseDto {
  @ApiProperty() configured!: boolean;
  @ApiProperty({ nullable: true }) azureTenantId!: string | null;
  @ApiProperty({ nullable: true }) azureClientId!: string | null;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty({ description: 'The Azure App Registration redirect URI to configure — derived from this tenant\'s own Keycloak realm, valid even before anything is saved.' })
  redirectUri!: string;
}
