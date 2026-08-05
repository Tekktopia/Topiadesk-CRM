import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AutomationTriggerType } from '@topiadesk/db';

/**
 * `@Type(() => Object)` on `actions`/`steps` below is load-bearing, not
 * decorative — found live while testing the multi-step engine (steps was
 * new; discovering it also silently broke `actions`, unexercised until
 * now since no AutomationRule had ever been created via this API with a
 * non-empty actions array, only empty-array or seed-inserted rows). With
 * the global ValidationPipe's `whitelist: true` + `transform: true`
 * (main.ts) and no `@Type()` hint, class-transformer has no target class
 * for each array element and — unlike a plain `Record<string, unknown>`
 * property (`conditions` below, which survives untouched) — silently
 * strips every property off each object inside an `unknown[]` array,
 * turning `[{actionType:"X", params:{...}}]` into `[{}]` before it ever
 * reaches the controller. `@Type(() => Object)` tells class-transformer
 * "each element is a plain object, don't try to shape it," which is
 * enough to stop the stripping.
 */
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
  @Type(() => Object)
  actions!: unknown[];
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Ordered multi-step sequence — additive, independent of `actions` above. Present + non-empty means "run through the multi-step engine instead of `actions`" (ENTITY_EVENT only; ignored for SCHEDULE-triggered rules and Macro apply). Each entry is either { type: "ACTION", actionType: string, params?: Record<string, unknown> } (same shape as one `actions` entry) or { type: "APPROVAL_GATE", reason?: string } — see backend/worker/src/automation/run-engine.ts.',
  })
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  steps?: unknown[];
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
  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true }, nullable: true }) steps?: unknown;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
