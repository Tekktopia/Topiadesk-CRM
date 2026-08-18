import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AutomationExecutionStatus, AutomationRuleStatus, AutomationTriggerType } from '@topiadesk/db';

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
  /**
   * SCHEDULE rules only. Required for them: a scheduled rule with no cadence
   * is exactly the rule that used to be saved, badged Active, and never run.
   * The controller enforces that rather than leaving it optional here,
   * because ENTITY_EVENT rules must keep omitting it.
   */
  @ApiPropertyOptional({ description: 'Standard 5-field cron, e.g. "0 8 * * 1-5" for weekdays at 8am. SCHEDULE rules only.' })
  @IsOptional()
  @IsString()
  scheduleCron?: string;

  @ApiPropertyOptional({ description: 'IANA timezone the cron is resolved in, e.g. "Africa/Lagos". Defaults to UTC.' })
  @IsOptional()
  @IsString()
  scheduleTimezone?: string;

  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({
    enum: AutomationRuleStatus,
    description:
      'Defaults to PUBLISHED when omitted — every existing caller (including the /admin/automations JSON dialog) never sends this and must keep running unchanged. DRAFT is the /admin/workflows builder\'s "Save as draft" — never matched by the engine (see automation-events.queue.ts/renewal-playbook.ts) regardless of isActive.',
  })
  @IsOptional()
  @IsEnum(AutomationRuleStatus)
  status?: AutomationRuleStatus;
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
  @ApiProperty({ enum: AutomationRuleStatus }) status!: string;
  @ApiPropertyOptional({ nullable: true }) scheduleCron?: string | null;
  @ApiPropertyOptional() scheduleTimezone?: string;
  @ApiPropertyOptional({ nullable: true, description: 'When this rule is next due to run. Null for ENTITY_EVENT rules.' })
  nextRunAt?: Date | null;
  @ApiPropertyOptional({ nullable: true }) lastRunAt?: Date | null;
  @ApiPropertyOptional({ nullable: true, description: "'OK' | 'FAILED' | 'SKIPPED' — surfaced so a rule that has quietly stopped working is visible on the list." })
  lastRunStatus?: string | null;
  @ApiPropertyOptional({ nullable: true }) lastRunError?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'How many records the last scheduled run acted on.' })
  lastMatchCount?: number | null;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** What the rule builder needs to render itself — entity types, their fields, and the actions available for each. */
export class AutomationCatalogResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) entityTypes!: unknown;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) actions!: unknown;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) operators!: unknown;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) schedulePresets!: unknown;
}

/** Result of a dry run — what the rule WOULD do, without doing any of it. */
export class AutomationSimulationResponseDto {
  @ApiProperty({ description: 'False when the rule is invalid; `issues` says why.' }) valid!: boolean;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) issues!: unknown;
  @ApiProperty({ description: 'How many records match right now.' }) matchCount!: number;
  @ApiProperty({ description: 'True when the match exceeds the rule’s per-run cap, so a real run would refuse.' })
  exceedsCap!: boolean;
  @ApiProperty({ description: 'Records already acted on, which a real run would skip.' }) alreadyHandledCount!: number;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'A sample of the matching records.' })
  sample!: unknown;
  @ApiProperty({ type: 'array', items: { type: 'string' }, description: 'Plain-English description of what would happen to each.' })
  plannedActions!: string[];
  @ApiPropertyOptional({ nullable: true, description: 'Next few firing times, for SCHEDULE rules.' })
  schedulePreview?: string[] | null;
}

/** One firing of a rule's flat `actions` list — see AutomationExecutionLog's schema comment. Branching (`steps`) runs have their own history via GET /automation-run-states, not this. */
export class AutomationExecutionLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) ruleId!: string | null;
  @ApiProperty() ruleName!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ nullable: true }) entityId!: string | null;
  @ApiProperty() triggerSource!: string;
  @ApiProperty({ enum: AutomationExecutionStatus }) status!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) actionResults!: unknown;
  @ApiProperty() createdAt!: Date;
}
