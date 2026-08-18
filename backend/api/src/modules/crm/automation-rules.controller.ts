import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import {
  ACTION_CATALOG,
  CONDITION_OPERATORS,
  DEFAULT_SCHEDULE_TIMEZONE,
  ENTITY_REGISTRY,
  SCHEDULE_PRESETS,
  baselineExclusions,
  computeNextRunAt,
  conditionsToPrismaWhere,
  describeConditions,
  getActionMeta,
  getEntityMeta,
  isValidTimezone,
  normalizeConditions,
  validateActions,
  validateConditions,
  validateCron,
} from '@topiadesk/automation';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT type-only: @Body()/@Query() parameter types need a runtime value for
// ValidationPipe to resolve the metatype.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AutomationCatalogResponseDto,
  AutomationExecutionLogResponseDto,
  AutomationRuleQueryDto,
  AutomationRuleResponseDto,
  AutomationSimulationResponseDto,
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
} from './dto/automation-rule.dto';

/**
 * automation_rules carries no RLS (same config tier as
 * custom_field_definitions/carriers/pipelines) — reads are ungated, writes
 * gated on 'account' since no dedicated 'automation_rule' permission
 * resource is seeded (mirrors carriers.controller.ts / pipelines.controller.ts
 * / custom-field-definitions.controller.ts).
 *
 * The Renewal Playbooks trigger wiring itself (evaluating ENTITY_EVENT
 * rules when a RenewalSchedule crosses an alert threshold, and running
 * CREATE_TASK actions) lives in backend/worker/src/jobs/renewal-alerts/
 * renewal-playbook.ts, hooked into the existing renewal-scan job — this
 * controller is CRUD only.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/automation-rules')
export class AutomationRulesController {
  @Get()
  @ApiOkResponse({ type: [AutomationRuleResponseDto] })
  async list(@Query() query: AutomationRuleQueryDto): Promise<AutomationRuleResponseDto[]> {
    return getPrismaClient().automationRule.findMany({
      where: { triggerType: query.triggerType },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Everything the rule builder needs to render itself.
   *
   * Served from the shared package rather than hardcoded in the frontend, so
   * the fields a rule may filter on, the actions it may run, and the entity
   * types it may target cannot drift from what the engine actually supports —
   * the drift that let the old UI offer a free-text field name that the
   * matcher then silently ignored.
   */
  @Get('catalog')
  @ApiOkResponse({ type: AutomationCatalogResponseDto })
  async catalog(): Promise<AutomationCatalogResponseDto> {
    return {
      entityTypes: Object.values(ENTITY_REGISTRY).map((meta) => ({
        entityType: meta.entityType,
        label: meta.label,
        pluralLabel: meta.pluralLabel,
        fields: meta.fields,
      })),
      actions: ACTION_CATALOG,
      operators: CONDITION_OPERATORS,
      schedulePresets: Object.entries(SCHEDULE_PRESETS).map(([key, preset]) => ({ key, ...preset })),
    };
  }

  @Get(':id')
  @ApiOkResponse({ type: AutomationRuleResponseDto })
  async getOne(@Param('id') id: string): Promise<AutomationRuleResponseDto> {
    const rule = await getPrismaClient().automationRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('AutomationRule not found');
    return rule;
  }

  /**
   * Firings of this rule's flat `actions` list, newest first — see
   * AutomationExecutionLog's schema comment. Only ever populated for a
   * rule whose `steps` is empty (the "simple/flat" path); a rule that's
   * always used `steps` will just return an empty array here — its history
   * lives in AutomationRunState (GET /automation-run-states) instead.
   */
  @Get(':id/execution-log')
  @ApiOkResponse({ type: [AutomationExecutionLogResponseDto] })
  async executionLog(@Param('id') id: string): Promise<AutomationExecutionLogResponseDto[]> {
    const rule = await getPrismaClient().automationRule.findUnique({ where: { id }, select: { id: true } });
    if (!rule) throw new NotFoundException('AutomationRule not found');
    return getPrismaClient().automationExecutionLog.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AutomationRuleResponseDto })
  async create(@Body() dto: CreateAutomationRuleDto, @CurrentUser() user: AuthenticatedUser): Promise<AutomationRuleResponseDto> {
    const { nextRunAt, timezone } = this.assertValid(dto.triggerType, dto.conditions, dto.actions, dto.scheduleCron, dto.scheduleTimezone);
    return getPrismaClient().automationRule.create({
      data: {
        name: dto.name,
        triggerType: dto.triggerType,
        conditions: dto.conditions as Prisma.InputJsonValue,
        actions: dto.actions as Prisma.InputJsonValue,
        steps: dto.steps as Prisma.InputJsonValue | undefined,
        scheduleCron: dto.scheduleCron ?? null,
        scheduleTimezone: timezone,
        nextRunAt,
        isActive: dto.isActive ?? true,
        // Explicit, not left to the bare DB default alone, for a
        // business-meaningful field — see the DTO's status doc comment.
        status: dto.status ?? 'PUBLISHED',
        createdById: user.id,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AutomationRuleResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto): Promise<AutomationRuleResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AutomationRule not found');

    // Validate the rule as it will BE after the patch, not just the fields in
    // this request — a PATCH that only changes the cron still has to be
    // checked against the conditions already stored, or a partial update
    // becomes a way to bypass validation entirely.
    const merged = {
      triggerType: dto.triggerType ?? existing.triggerType,
      conditions: (dto.conditions ?? existing.conditions) as Record<string, unknown>,
      actions: (dto.actions ?? existing.actions) as unknown[],
      scheduleCron: dto.scheduleCron ?? existing.scheduleCron ?? undefined,
      scheduleTimezone: dto.scheduleTimezone ?? existing.scheduleTimezone,
    };
    const { nextRunAt, timezone } = this.assertValid(
      merged.triggerType,
      merged.conditions,
      merged.actions,
      merged.scheduleCron,
      merged.scheduleTimezone,
    );

    return prisma.automationRule.update({
      where: { id },
      data: {
        name: dto.name,
        triggerType: dto.triggerType,
        conditions: dto.conditions as Prisma.InputJsonValue | undefined,
        actions: dto.actions as Prisma.InputJsonValue | undefined,
        steps: dto.steps as Prisma.InputJsonValue | undefined,
        scheduleCron: dto.scheduleCron,
        scheduleTimezone: timezone,
        // Recomputed on every save so a cadence change takes effect now
        // rather than after the rule's previously-scheduled firing.
        nextRunAt,
        isActive: dto.isActive,
        status: dto.status,
      },
    });
  }

  /**
   * Dry run: what WOULD this rule do, right now, without doing any of it.
   *
   * There was no way to try a rule before publishing it. For a feature whose
   * whole job is mutating records in bulk with nobody watching, the first
   * feedback an admin got was the result — which for "email every client
   * whose policy expires soon" is the wrong moment to discover the conditions
   * were too broad. This runs the same matcher the engine uses (the shared
   * package, not a reimplementation, or the preview would be a different
   * question from the real one) and reports the count, a sample, and what
   * each action would do.
   *
   * Read-only by construction: it never calls an action handler.
   */
  @Post('simulate')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AutomationSimulationResponseDto })
  async simulate(@Body() dto: CreateAutomationRuleDto): Promise<AutomationSimulationResponseDto> {
    const conditions = normalizeConditions(dto.conditions);
    const isSchedule = dto.triggerType === 'SCHEDULE';
    const issues: { field: string; message: string }[] = [
      ...validateConditions(conditions, isSchedule).map((i) => ({ field: i.field, message: i.message })),
      ...validateActions(dto.actions, conditions.entityType).map((i) => ({ field: i.actionType, message: i.message })),
    ];

    let schedulePreview: string[] | null = null;
    if (isSchedule) {
      const cronCheck = validateCron(dto.scheduleCron ?? '', dto.scheduleTimezone || DEFAULT_SCHEDULE_TIMEZONE);
      if (!cronCheck.valid) issues.push({ field: 'scheduleCron', message: cronCheck.error ?? 'Invalid schedule.' });
      schedulePreview = cronCheck.preview ?? null;
    }

    const meta = conditions.entityType ? getEntityMeta(conditions.entityType) : undefined;
    if (issues.length > 0 || !meta) {
      return {
        valid: false,
        issues,
        matchCount: 0,
        exceedsCap: false,
        alreadyHandledCount: 0,
        sample: [],
        plannedActions: [],
        schedulePreview,
      };
    }

    const now = new Date();
    const prisma = getPrismaClient();
    const where = { ...baselineExclusions(meta.entityType), ...conditionsToPrismaWhere(conditions, now) };
    const delegate = prisma[meta.model] as unknown as {
      count(args: unknown): Promise<number>;
      findMany(args: unknown): Promise<Record<string, unknown>[]>;
    };

    const matchCount = await delegate.count({ where });
    const sampleRows = await delegate.findMany({ where, take: 10, orderBy: { createdAt: 'asc' } });

    const cap = conditions.maxEntitiesPerRun ?? 200;
    const sample = sampleRows.map((row) => ({
      id: String(row.id),
      label: String(row[meta.titleField] ?? row.id),
    }));

    // How many of the matches a real run would skip as already handled.
    // Without this the preview overstates what would happen on the second and
    // subsequent runs of a once-per-record rule.
    let alreadyHandledCount = 0;
    if (conditions.repeat !== 'EVERY_RUN' && sampleRows.length > 0) {
      alreadyHandledCount = await prisma.automationExecutionLog.count({
        where: {
          ruleName: dto.name,
          entityType: meta.entityType,
          entityId: { in: sampleRows.map((r) => String(r.id)) },
          status: { in: ['SUCCESS', 'PARTIAL_FAILURE'] },
        },
      });
    }

    const plannedActions = (dto.actions as { actionType?: string }[]).map((action) => {
      const actionMeta = getActionMeta(action.actionType ?? '');
      return actionMeta ? `${actionMeta.label} — ${actionMeta.description}` : `Unknown action "${action.actionType}"`;
    });

    return {
      valid: true,
      issues: [],
      matchCount,
      exceedsCap: matchCount > cap,
      alreadyHandledCount,
      sample,
      plannedActions: [`Matches ${meta.pluralLabel} where ${describeConditions(conditions)}.`, ...plannedActions],
      schedulePreview,
    };
  }

  /**
   * Save-time validation, shared by create and update.
   *
   * Previously nothing checked a rule at all: an unknown field, a
   * nonexistent action, or a SCHEDULE rule with no cadence all saved
   * cleanly and then either did nothing or silently matched everything.
   * Rejecting here is the whole point — a rule that mutates records in bulk
   * should fail while an admin is looking at it, not at 3am against the book.
   */
  private assertValid(
    triggerType: string,
    conditions: Record<string, unknown>,
    actions: unknown[],
    scheduleCron: string | undefined,
    scheduleTimezone: string | undefined,
  ): { nextRunAt: Date | null; timezone: string } {
    const parsed = normalizeConditions(conditions);
    const isSchedule = triggerType === 'SCHEDULE';
    const timezone = scheduleTimezone || DEFAULT_SCHEDULE_TIMEZONE;

    if (scheduleTimezone && !isValidTimezone(scheduleTimezone)) {
      throw new BadRequestException(`"${scheduleTimezone}" is not a recognised timezone.`);
    }

    // A scheduled rule must say which records it applies to — the scanner has
    // to FIND them, unlike an event rule which is handed one.
    const issues = [
      ...validateConditions(parsed, isSchedule).map((i) => i.message),
      ...validateActions(actions, parsed.entityType).map((i) => i.message),
    ];

    let nextRunAt: Date | null = null;
    if (isSchedule) {
      const cronCheck = validateCron(scheduleCron ?? '', timezone);
      if (!cronCheck.valid) {
        issues.push(cronCheck.error ?? 'This rule needs a schedule.');
      } else {
        nextRunAt = computeNextRunAt(scheduleCron ?? '', timezone, new Date());
      }
    }

    if (issues.length > 0) throw new BadRequestException(issues.join(' '));
    return { nextRunAt, timezone };
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AutomationRule not found');
    await prisma.automationRule.delete({ where: { id } });
    return { deleted: true };
  }
}
