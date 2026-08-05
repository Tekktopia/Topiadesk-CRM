import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AutomationTriggerType } from '@topiadesk/db';

export class CreateAutomationRuleDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: AutomationTriggerType }) @IsEnum(AutomationTriggerType) triggerType!: AutomationTriggerType;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'For the Renewal Playbooks consumer (ENTITY_EVENT): { entityType: "RENEWAL_SCHEDULE", thresholds?: number[] (days; omit to match every threshold), filters?: { lineOfBusiness?: string } } — see renewal-playbook.ts (backend/worker) for the matcher.',
  })
  @IsObject()
  conditions!: Record<string, unknown>;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'ActionSpec[] = [{ actionType: string, params: Record<string, unknown> }]. Currently registered: CREATE_TASK — params: { title: string, description?: string, dueInDays?: number (default 3), assigneeId?: string (defaults to the renewal\'s assignee/broker-of-record) }.',
  })
  @IsArray()
  actions!: unknown[];
  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateAutomationRuleDto extends PartialType(CreateAutomationRuleDto) {}

export class AutomationRuleQueryDto {
  @ApiProperty({ enum: AutomationTriggerType, required: false }) @IsOptional() @IsEnum(AutomationTriggerType) triggerType?: AutomationTriggerType;
}

export class AutomationRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: AutomationTriggerType }) triggerType!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) conditions!: unknown;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) actions!: unknown;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
