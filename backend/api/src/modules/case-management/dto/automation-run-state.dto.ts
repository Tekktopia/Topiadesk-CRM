import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

const DECISIONS = ['APPROVED', 'REJECTED'] as const;

export class DecideAutomationRunDto {
  @ApiProperty({ enum: DECISIONS }) @IsIn(DECISIONS) decision!: (typeof DECISIONS)[number];
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
