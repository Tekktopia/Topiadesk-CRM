import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  AutomationRuleQueryDto,
  AutomationRuleResponseDto,
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

  @Get(':id')
  @ApiOkResponse({ type: AutomationRuleResponseDto })
  async getOne(@Param('id') id: string): Promise<AutomationRuleResponseDto> {
    const rule = await getPrismaClient().automationRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('AutomationRule not found');
    return rule;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: AutomationRuleResponseDto })
  async create(@Body() dto: CreateAutomationRuleDto, @CurrentUser() user: AuthenticatedUser): Promise<AutomationRuleResponseDto> {
    return getPrismaClient().automationRule.create({
      data: {
        name: dto.name,
        triggerType: dto.triggerType,
        conditions: dto.conditions as Prisma.InputJsonValue,
        actions: dto.actions as Prisma.InputJsonValue,
        steps: dto.steps as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive ?? true,
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
    return prisma.automationRule.update({
      where: { id },
      data: {
        name: dto.name,
        triggerType: dto.triggerType,
        conditions: dto.conditions as Prisma.InputJsonValue | undefined,
        actions: dto.actions as Prisma.InputJsonValue | undefined,
        steps: dto.steps as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
      },
    });
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
