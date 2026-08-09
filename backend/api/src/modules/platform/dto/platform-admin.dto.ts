import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export class CreatePlatformAdminDto {
  @ApiProperty({ description: 'Signs into the "topiadesk-platform" Keycloak realm with this address and receives the invite email.' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;
}

/** No `role` field on create — every new platform admin starts at SUPPORT
 * (the schema column's own default); reaching SUPER_ADMIN always requires
 * a separate, auditable PATCH :id/role call by an existing SUPER_ADMIN,
 * never a side effect of account creation itself. */
export class UpdatePlatformAdminRoleDto {
  @ApiProperty({ enum: ['SUPPORT', 'SUPER_ADMIN'] })
  @IsIn(['SUPPORT', 'SUPER_ADMIN'])
  role!: 'SUPPORT' | 'SUPER_ADMIN';
}

export class PlatformAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ enum: ['SUPPORT', 'SUPER_ADMIN'] }) role!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
