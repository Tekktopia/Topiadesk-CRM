import { ApiProperty } from '@nestjs/swagger';

export class AccountResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() accountType!: string;
  @ApiProperty() status!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty({ nullable: true }) riskRating!: string | null;
  @ApiProperty() createdAt!: Date;
}
