import { ApiProperty } from '@nestjs/swagger';

export class AccountResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() accountType!: string;
  @ApiProperty() status!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty({ nullable: true }) riskRating!: string | null;
  @ApiProperty({ nullable: true }) industryId!: string | null;
  @ApiProperty({ nullable: true }) parentAccountId!: string | null;
  @ApiProperty({ nullable: true }) city!: string | null;
  @ApiProperty({ nullable: true }) country!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

class ContactSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) title!: string | null;
  @ApiProperty() isPrimary!: boolean;
}

class AccountCountsDto {
  @ApiProperty() contacts!: number;
  @ApiProperty() opportunities!: number;
  @ApiProperty() tasks!: number;
  @ApiProperty() policies!: number;
  @ApiProperty() activities!: number;
  @ApiProperty() relationships!: number;
}

/** GET /crm/accounts/:id — summary "360" view: account + contacts + lightweight counts, not eagerly-loaded child collections. */
export class AccountDetailResponseDto extends AccountResponseDto {
  @ApiProperty({ type: [ContactSummaryDto] }) contacts!: ContactSummaryDto[];
  @ApiProperty({ type: AccountCountsDto }) counts!: AccountCountsDto;
}
