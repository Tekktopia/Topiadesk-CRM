import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsUUID } from 'class-validator';
import type { PolicyStatus } from '@topiadesk/db';

const POLICY_STATUSES = ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'] as const;

/**
 * Shared shape for every bulk endpoint in this module (Policy/Premium) —
 * mirrors crm/dto/bulk-action.dto.ts exactly, duplicated rather than
 * imported across the module boundary per this codebase's existing
 * module-independence discipline.
 */
export class BulkActionResponseDto {
  @ApiProperty({ type: [String] }) requested!: string[];
  @ApiProperty({ type: [String] }) updated!: string[];
  @ApiProperty({ type: [String] }) skipped!: string[];
}

export class BulkAssignPoliciesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() brokerOfRecordId!: string;
}

// status is validated per-row against POLICY_STATUS_TRANSITIONS (same rules
// the single-row PATCH already enforces) — a batch containing a row whose
// current status can't reach the target lands that row in `skipped`, not a
// raw updateMany that would bypass the lifecycle machine.
export class BulkUpdatePoliciesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ enum: POLICY_STATUSES }) @IsIn(POLICY_STATUSES) status!: PolicyStatus;
}

export class BulkMarkPremiumsPaidDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}
