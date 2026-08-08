import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

const DECISIONS = ['APPROVED', 'REJECTED'] as const;

export class DecideAutomationRunDto {
  @ApiProperty({ enum: DECISIONS }) @IsIn(DECISIONS) decision!: (typeof DECISIONS)[number];
  /** Optional on approve, required on reject — a reject with no stated
   * reason is rarely useful in a compliance-driven approval flow. Stored
   * as Approval.decisionNote (the decider's own comment, distinct from
   * the rule author's static gate `reason`). `@ValidateIf` returning false
   * on approve skips every validator below it, so `note` is simply
   * unvalidated (any value, including absent) when decision is APPROVED. */
  @ApiPropertyOptional({ description: 'Required when decision is REJECTED.' })
  @ValidateIf((o: DecideAutomationRunDto) => o.decision === 'REJECTED')
  @IsString()
  @MinLength(1)
  note?: string;
}

export class AutomationRunStateQueryDto {
  @ApiProperty({ enum: ['CASE', 'CLAIM'] }) @IsIn(['CASE', 'CLAIM']) entityType!: 'CASE' | 'CLAIM';
  @ApiProperty() @IsUUID() entityId!: string;
}

export class AutomationRunStateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() ruleId!: string;
  @ApiPropertyOptional() ruleName?: string;
  @ApiProperty({ enum: ['CASE', 'CLAIM'] }) entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ enum: ['RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED'] }) status!: string;
  @ApiProperty() currentStepIndex!: number;
  @ApiPropertyOptional({ nullable: true }) approvalId!: string | null;
  @ApiPropertyOptional({ nullable: true }) failureReason!: string | null;
  @ApiProperty() startedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) completedAt!: Date | null;
}
