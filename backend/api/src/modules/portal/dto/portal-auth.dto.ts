import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RequestPortalLoginLinkDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class ConsumePortalLoginTokenDto {
  @ApiProperty() @IsString() @MinLength(1) token!: string;
}

export class PortalSessionResponseDto {
  @ApiProperty() sessionToken!: string;
  @ApiProperty() contactName!: string;
  @ApiProperty() accountName!: string;
}
