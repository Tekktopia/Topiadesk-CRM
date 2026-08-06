import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { decimalToString } from './decimal.util';
import {
  ApprovalThresholdRuleResponseDto,
  CreateApprovalThresholdRuleDto,
  UpdateApprovalThresholdRuleDto,
} from './dto/approval-threshold-rule.dto';

/**
 * Admin CRUD for ApprovalThresholdRule — consumed by
 * policy-lifecycle.ts's resolveApprovalThreshold() (policy-version.controller.ts's
 * create()/decideApproval()). Gated by the same 'approval' resource the
 * decision endpoint itself uses (@RequirePermission('approval','write') on
 * PolicyVersionController.decideApproval) — configuring the threshold is
 * the same trust tier as deciding an approval.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/approval-threshold-rules')
export class ApprovalThresholdRulesController {
  @Get()
  @RequirePermission('approval', 'read')
  @ApiOkResponse({ type: [ApprovalThresholdRuleResponseDto] })
  async list(): Promise<ApprovalThresholdRuleResponseDto[]> {
    const rules = await getPrismaClient().approvalThresholdRule.findMany({ orderBy: [{ versionType: 'asc' }, { minAmount: 'asc' }] });
    return rules.map((r) => ({ ...r, minAmount: decimalToString(r.minAmount) }));
  }

  @Post()
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: ApprovalThresholdRuleResponseDto })
  async create(@Body() dto: CreateApprovalThresholdRuleDto): Promise<ApprovalThresholdRuleResponseDto> {
    const rule = await getPrismaClient().approvalThresholdRule.create({
      data: { versionType: dto.versionType, minAmount: dto.minAmount, requiredApprovals: dto.requiredApprovals },
    });
    return { ...rule, minAmount: decimalToString(rule.minAmount) };
  }

  @Patch(':id')
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: ApprovalThresholdRuleResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateApprovalThresholdRuleDto): Promise<ApprovalThresholdRuleResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.approvalThresholdRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Approval threshold rule not found');
    const rule = await prisma.approvalThresholdRule.update({
      where: { id },
      data: { versionType: dto.versionType, minAmount: dto.minAmount, requiredApprovals: dto.requiredApprovals },
    });
    return { ...rule, minAmount: decimalToString(rule.minAmount) };
  }

  @Delete(':id')
  @RequirePermission('approval', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.approvalThresholdRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Approval threshold rule not found');
    await prisma.approvalThresholdRule.delete({ where: { id } });
    return { deleted: true };
  }
}
