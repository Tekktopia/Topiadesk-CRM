import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AgentSkillResponseDto, CreateAgentSkillDto, UpdateAgentSkillDto } from './dto/agent-skill.dto';

/**
 * "admin-authored" per prisma/rls/002_policies.sql's agent_skills_rw
 * comment — reads are additionally self-visible at the RLS layer
 * (user_id = self), but this controller's NestJS-level gate is 'sla_config'
 * for both actions, same tier as assignment-rules.controller.ts (the rule
 * engine that consumes these skill tags for SKILL_BASED assignment).
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('agent-skills')
export class AgentSkillsController {
  @Get()
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [AgentSkillResponseDto] })
  async list(): Promise<AgentSkillResponseDto[]> {
    return getPrismaClient().agentSkill.findMany({ orderBy: { skillTag: 'asc' } });
  }

  @Get(':id')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: AgentSkillResponseDto })
  async getOne(@Param('id') id: string): Promise<AgentSkillResponseDto> {
    const skill = await getPrismaClient().agentSkill.findUnique({ where: { id } });
    if (!skill) throw new NotFoundException('AgentSkill not found');
    return skill;
  }

  @Post()
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: AgentSkillResponseDto })
  async create(@Body() dto: CreateAgentSkillDto): Promise<AgentSkillResponseDto> {
    return getPrismaClient().agentSkill.create({ data: { userId: dto.userId, skillTag: dto.skillTag, proficiency: dto.proficiency } });
  }

  @Patch(':id')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: AgentSkillResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAgentSkillDto): Promise<AgentSkillResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.agentSkill.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AgentSkill not found');
    return prisma.agentSkill.update({ where: { id }, data: { userId: dto.userId, skillTag: dto.skillTag, proficiency: dto.proficiency } });
  }

  @Delete(':id')
  @RequirePermission('sla_config', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.agentSkill.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('AgentSkill not found');
    await prisma.agentSkill.delete({ where: { id } });
    return { deleted: true };
  }
}
