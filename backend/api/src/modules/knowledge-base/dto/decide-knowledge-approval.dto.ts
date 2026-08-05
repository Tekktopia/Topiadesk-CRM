import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const DECISIONS = ['APPROVED', 'REJECTED'] as const;

/**
 * Same shape as policy/dto/decide-approval.dto.ts's DecideApprovalDto —
 * duplicated locally rather than imported cross-module. Each Batch 1/
 * Phase 2 module is scoped to its own directory (five other agents are
 * building sibling domains in parallel against the same shared schema);
 * importing across module boundaries for a four-line DTO would trade a
 * trivial duplication for a real coupling/merge-conflict risk.
 */
export class DecideKnowledgeApprovalDto {
  @ApiProperty({ enum: DECISIONS }) @IsIn(DECISIONS) decision!: (typeof DECISIONS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
