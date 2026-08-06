import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared shape for every bulk endpoint in this module (Case/Claim) —
 * mirrors crm/dto/bulk-action.dto.ts exactly (same contract: `updated`
 * names rows actually touched, `skipped` makes RLS-filtered/invalid-
 * transition rows explicit instead of a silent drop), duplicated rather
 * than imported across the module boundary — same module-independence
 * discipline this codebase already follows elsewhere (survey-dispatch's
 * api/worker duplication, the six near-identical ApiRequestError copies).
 */
export class BulkActionResponseDto {
  @ApiProperty({ type: [String] }) requested!: string[];
  @ApiProperty({ type: [String] }) updated!: string[];
  @ApiProperty({ type: [String] }) skipped!: string[];
}
