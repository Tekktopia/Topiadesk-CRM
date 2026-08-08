import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateScimTokenDto {
  @ApiProperty({ description: 'Human-readable label, e.g. "Okta provisioning" or "Azure AD SCIM"' })
  @IsString()
  @MinLength(1)
  description!: string;
}

/** The only field editable after creation — the raw token itself is never
 * re-shown/re-editable (see ScimTokenCreatedResponseDto), only revoke
 * (deactivate) or hard-delete can change its usability. */
export class UpdateScimTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  description!: string;
}

export class ScimTokenResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() description!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true }) lastUsedAt!: Date | null;
}

/** Only this response ever carries the raw token — it is never retrievable again after this call (only tokenHash is stored). */
export class ScimTokenCreatedResponseDto extends ScimTokenResponseDto {
  @ApiProperty({ description: 'The raw bearer token — shown once, store it now. Use as `Authorization: Bearer <token>` against /scim/v2/*.' })
  token!: string;
}
