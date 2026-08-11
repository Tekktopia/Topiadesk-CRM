import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateProducerDto, ProducerResponseDto, UpdateProducerDto } from './dto/producer.dto';
import { CreateProducerPolicyAssignmentDto, ProducerPolicyAssignmentResponseDto } from './dto/producer-policy-assignment.dto';
import { decimalToString } from './decimal.util';

/**
 * producers has no RLS policy (prisma/rls/001_enable_rls.sql deliberately
 * omits it — org-wide roster of who earns commission, same "config tier" as
 * carriers/pipelines). Reads are ungated beyond authentication; writes are
 * gated on the dedicated 'producer' resource (packages/db/src/seed/baseline.ts).
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('producers')
export class ProducersController {
  @Get()
  @ApiOkResponse({ type: [ProducerResponseDto] })
  async list(): Promise<ProducerResponseDto[]> {
    return getPrismaClient().producer.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @ApiOkResponse({ type: ProducerResponseDto })
  async getOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProducerResponseDto> {
    const producer = await getPrismaClient().producer.findUnique({ where: { id } });
    if (!producer) throw new NotFoundException('Producer not found');
    return producer;
  }

  @Post()
  @RequirePermission('producer', 'write')
  @ApiOkResponse({ type: ProducerResponseDto })
  async create(@Body() dto: CreateProducerDto): Promise<ProducerResponseDto> {
    return getPrismaClient().producer.create({
      data: { ...dto, licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined },
    });
  }

  @Patch(':id')
  @RequirePermission('producer', 'write')
  @ApiOkResponse({ type: ProducerResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProducerDto): Promise<ProducerResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.producer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Producer not found');
    return prisma.producer.update({
      where: { id },
      data: { ...dto, licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined },
    });
  }

  @Delete(':id')
  @RequirePermission('producer', 'write')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.producer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Producer not found');
    await prisma.producer.delete({ where: { id } });
    return { deleted: true };
  }
}

function toAssignmentDto(row: { id: string; policyId: string; producerId: string; role: string; commissionSplitPercent: unknown; createdAt: Date }): ProducerPolicyAssignmentResponseDto {
  return {
    id: row.id,
    policyId: row.policyId,
    producerId: row.producerId,
    role: row.role as ProducerPolicyAssignmentResponseDto['role'],
    commissionSplitPercent: decimalToString(row.commissionSplitPercent as never),
    createdAt: row.createdAt,
  };
}

/**
 * Nested under a policy — the commission-split roster (who earns what % on
 * this policy). Gated on 'policy' read/write, not a dedicated
 * 'producer_policy_assignment' resource — reuses Policy's own scope, same
 * shape as PolicyPremiumController in premium.controller.ts, and RLS
 * (producer_policy_assignments_rw in prisma/rls/002_policies.sql) scopes
 * identically through the parent Policy.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/producers')
export class PolicyProducerAssignmentController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [ProducerPolicyAssignmentResponseDto] })
  async list(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<ProducerPolicyAssignmentResponseDto[]> {
    const rows = await getPrismaClient().producerPolicyAssignment.findMany({ where: { policyId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toAssignmentDto);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: ProducerPolicyAssignmentResponseDto })
  async create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreateProducerPolicyAssignmentDto,
  ): Promise<ProducerPolicyAssignmentResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');

    const row = await prisma.producerPolicyAssignment.create({
      data: {
        policyId,
        producerId: dto.producerId,
        role: dto.role,
        commissionSplitPercent: dto.commissionSplitPercent,
      },
    });
    return toAssignmentDto(row);
  }

  @Delete(':assignmentId')
  @RequirePermission('policy', 'write')
  async remove(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.producerPolicyAssignment.findFirst({ where: { id: assignmentId, policyId } });
    if (!existing) throw new NotFoundException('Producer assignment not found');
    await prisma.producerPolicyAssignment.delete({ where: { id: assignmentId } });
    return { deleted: true };
  }
}
