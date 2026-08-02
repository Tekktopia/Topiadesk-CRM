import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

/** Generic key/value store — DO NOT hardcode handling for specific keys here; renewal.default_alert_thresholds_days and security.mfa_required_roles are just two of potentially many seeded/admin-set entries. */
export class OrgSettingResponseDto {
  @ApiProperty() key!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) value!: unknown;
  @ApiProperty({ nullable: true }) updatedById!: string | null;
  @ApiProperty() updatedAt!: Date;
}

export class SetOrgSettingDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Arbitrary JSON value — object, array, string, number, or boolean',
  })
  @IsDefined()
  value!: unknown;
}
