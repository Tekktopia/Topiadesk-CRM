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
  @ApiProperty({ type: 'object', additionalProperties: true }) customFields!: unknown;
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

class AccountRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class AccountCountsDto {
  @ApiProperty() contacts!: number;
  @ApiProperty() opportunities!: number;
  @ApiProperty() tasks!: number;
  @ApiProperty() policies!: number;
  @ApiProperty() activities!: number;
  @ApiProperty() relationships!: number;
}

/**
 * Roll-up sums across this account's Policies/Premiums/Opportunities —
 * previously nowhere visible at the account level despite every underlying
 * number already being tracked per-Policy/-Premium/-Opportunity. `null` on
 * any field means "no rows to sum" (an account with zero policies has
 * `totalSumInsured: null`, not `0` — distinct from "policies exist but are
 * all worth nothing").
 */
class AccountFinancialsDto {
  @ApiProperty({ nullable: true }) totalSumInsured!: string | null;
  @ApiProperty({ nullable: true }) totalGrossPremium!: string | null;
  @ApiProperty({ nullable: true }) totalOutstandingPremium!: string | null;
  @ApiProperty({ nullable: true }) wonOpportunityValue!: string | null;
}

/** GET /crm/accounts/:id — summary "360" view: account + contacts + lightweight counts, not eagerly-loaded child collections. */
export class AccountDetailResponseDto extends AccountResponseDto {
  @ApiProperty({ type: [ContactSummaryDto] }) contacts!: ContactSummaryDto[];
  @ApiProperty({ type: AccountCountsDto }) counts!: AccountCountsDto;
  @ApiProperty({ type: AccountFinancialsDto }) financials!: AccountFinancialsDto;
  // id+name only — full hierarchy detail is its own resource
  // (GET .../relationships) the same way version history/renewal schedule
  // already stay out of this response's shape (see the comment on the old
  // findOne() this endpoint superseded).
  @ApiProperty({ type: AccountRefDto, nullable: true }) parentAccount!: { id: string; name: string } | null;
  @ApiProperty({ type: [AccountRefDto] }) subAccounts!: { id: string; name: string }[];
}

/** GET /crm/accounts/:id/renewals — every policy on the account joined with its RenewalSchedule (if any), for the account-level renewal overview. */
export class AccountRenewalRowDto {
  @ApiProperty() policyId!: string;
  @ApiProperty() policyNumber!: string;
  @ApiProperty() policyStatus!: string;
  @ApiProperty() expiryDate!: Date;
  @ApiProperty({ nullable: true }) renewalStatus!: string | null;
  @ApiProperty({ nullable: true }) renewalDueDate!: Date | null;
  @ApiProperty({ nullable: true }) nextAlertDueAt!: Date | null;
  @ApiProperty({ nullable: true }) assignedToId!: string | null;
}
