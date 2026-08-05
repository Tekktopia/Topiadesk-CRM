import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AssignmentRuleResponseDto, AssignmentTestResponseDto, CreateAssignmentRuleDto, UpdateAssignmentRuleDto } from './dto/assignment-rule.dto';
import { resolveNextAssignee } from './assignment-resolver.util';

/** Same 'sla_config' admin-authored tier as sla-policies.controller.ts / business-hours.controller.ts. */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('assignment-rules')
export class AssignmentRulesController {
  @Get()
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [AssignmentRuleResponseDto] })
  async list(): Promise<AssignmentRuleResponseDto[]> {
    return getPrismaClient().assignmentRule.findMany({ orderBy: [{ priority: 'desc' }, { name: 'asc' }] });
  }

  @Get(':id')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: AssignmentRuleResponseDto })
  async getOne(@Param('id') id: string): Promise<AssignmentRuleResponseDto> {
    const rule = await getPrismaClient().assignmentRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('AssignmentRule not found');
    return rule;
  }

  @Post()
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: AssignmentRuleResponseDto })
  async create(@Body() dto: CreateAssignmentRuleDto): Promise<AssignmentRuleResponseDto> {
    return getPrismaClient().assignmentRule.create({
      data: {
        name: dto.name,
        entityType: dto.entityType,
        strategy: dto.strategy,
        conditions: (dto.conditions ?? {}) as unknown as Prisma.InputJsonValue,
        candidatePoolTeamId: dto.candidatePoolTeamId,
        requiredSkillTags: dto.requiredSkillTags ?? [],
        priority: dto.priority,
        isActive: dto.isActive,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: AssignmentRuleResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAssignmentRuleDto): Promise<AssignmentRuleResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.assignmentRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AssignmentRule not found');
    return prisma.assignmentRule.update({
      where: { id },
      data: {
        name: dto.name,
        strategy: dto.strategy,
        conditions: dto.conditions ? (dto.conditions as unknown as Prisma.InputJsonValue) : undefined,
        candidatePoolTeamId: dto.candidatePoolTeamId,
        requiredSkillTags: dto.requiredSkillTags,
        priority: dto.priority,
        isActive: dto.isActive,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('sla_config', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.assignmentRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AssignmentRule not found');
    await prisma.assignmentRule.delete({ where: { id } });
    return { deleted: true };
  }

  /** Dry-run: resolves who this rule would assign right now, without persisting the ROUND_ROBIN cursor (lastAssignedUserId). */
  @Post(':id/test')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: AssignmentTestResponseDto })
  async test(@Param('id') id: string): Promise<AssignmentTestResponseDto> {
    const rule = await getPrismaClient().assignmentRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('AssignmentRule not found');
    const resolution = await resolveNextAssignee(rule, false);
    return { ruleId: id, userId: resolution.userId, reasoning: resolution.reasoning };
  }
}
