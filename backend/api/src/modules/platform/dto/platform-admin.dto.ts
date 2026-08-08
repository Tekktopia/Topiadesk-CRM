import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreatePlatformAdminDto {
  @ApiProperty({ description: 'Signs into the "topiadesk-platform" Keycloak realm with this address and receives the invite email.' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;
}

export class PlatformAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
