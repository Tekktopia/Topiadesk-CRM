import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared shape for every bulk endpoint (assign/update/delete, across
 * Account/Contact/Lead/Opportunity/Task) — `updated` names the rows the
 * operation actually touched for all three verbs, including delete, per the
 * build brief's single response contract. RLS-filtered updateMany/deleteMany
 * can silently affect fewer rows than requested; `skipped` makes that gap
 * explicit instead of a silent drop.
 */
export class BulkActionResponseDto {
  @ApiProperty({ type: [String] }) requested!: string[];
  @ApiProperty({ type: [String] }) updated!: string[];
  @ApiProperty({ type: [String] }) skipped!: string[];
}
