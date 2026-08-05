import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UnsubscribeQueryDto {
  @ApiProperty({ description: 'Signed token embedded in the campaign send — see unsubscribe-token.util.ts' })
  @IsString()
  @MinLength(1)
  token!: string;
}

export class UnsubscribeResponseDto {
  @ApiProperty() unsubscribed!: boolean;
  @ApiProperty() emailOrPhone!: string;
  @ApiProperty() channel!: string;
}
