import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class UpsertExchangeRateDto {
  @ApiProperty({ description: 'ISO 4217 code, e.g. "USD". The org base currency (NGN) never has its own row — its implicit rate is 1.' })
  @IsString()
  @Length(3, 3)
  currencyCode!: string;
  @ApiProperty({ description: 'How many NGN one unit of currencyCode is worth, e.g. 1600 for USD.' })
  @IsNumber()
  @IsPositive()
  rateToBase!: number;
}

export class ExchangeRateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() rateToBase!: string;
  @ApiProperty({ nullable: true }) updatedById!: string | null;
  @ApiProperty() updatedAt!: Date;
}
