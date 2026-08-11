import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type PolicyAsset, type PolicyCoverage, type PolicyParticipant } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreatePolicyCoverageDto, PolicyCoverageResponseDto, UpdatePolicyCoverageDto } from './dto/policy-coverage.dto';
import { CreatePolicyParticipantDto, PolicyParticipantResponseDto, UpdatePolicyParticipantDto } from './dto/policy-participant.dto';
import { CreatePolicyAssetDto, PolicyAssetResponseDto, UpdatePolicyAssetDto } from './dto/policy-asset.dto';
import { decimalToString } from './decimal.util';

function toCoverageDto(row: PolicyCoverage): PolicyCoverageResponseDto {
  return {
    ...row,
    sumInsured: decimalToString(row.sumInsured),
    premium: decimalToString(row.premium),
    deductible: decimalToString(row.deductible),
  };
}

/**
 * Policy depth — Coverages/Participants/Assets, FSC's InsurancePolicyCoverage/
 * Participant/Asset. All three nested under a policy, all gated on the
 * existing 'policy' resource (no dedicated resource — see
 * prisma/rls/002_policies.sql's comment on why these don't need
 * producer_commission-style independent tuning). Unlike
 * PolicyPremiumController (list/create only, PATCH lives on a separate
 * top-level /premiums/:id route), these get full CRUD directly at the
 * nested level — there's no cross-policy "all coverages" report anywhere in
 * the FSC spec's Tranche 2 scope that would need a top-level route.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/coverages')
export class PolicyCoverageController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PolicyCoverageResponseDto] })
  async list(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<PolicyCoverageResponseDto[]> {
    const rows = await getPrismaClient().policyCoverage.findMany({ where: { policyId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toCoverageDto);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyCoverageResponseDto })
  async create(@Param('policyId', ParseUUIDPipe) policyId: string, @Body() dto: CreatePolicyCoverageDto): Promise<PolicyCoverageResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');
    const row = await prisma.policyCoverage.create({ data: { ...dto, policyId } });
    return toCoverageDto(row);
  }

  @Patch(':id')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyCoverageResponseDto })
  async update(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePolicyCoverageDto,
  ): Promise<PolicyCoverageResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.policyCoverage.findFirst({ where: { id, policyId } });
    if (!existing) throw new NotFoundException('Coverage not found');
    const row = await prisma.policyCoverage.update({ where: { id }, data: dto });
    return toCoverageDto(row);
  }

  @Delete(':id')
  @RequirePermission('policy', 'write')
  async remove(@Param('policyId', ParseUUIDPipe) policyId: string, @Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.policyCoverage.findFirst({ where: { id, policyId } });
    if (!existing) throw new NotFoundException('Coverage not found');
    await prisma.policyCoverage.delete({ where: { id } });
    return { deleted: true };
  }
}

function toParticipantDto(row: PolicyParticipant): PolicyParticipantResponseDto {
  return { ...row, percentage: decimalToString(row.percentage) };
}

@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/participants')
export class PolicyParticipantController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PolicyParticipantResponseDto] })
  async list(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<PolicyParticipantResponseDto[]> {
    const rows = await getPrismaClient().policyParticipant.findMany({ where: { policyId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toParticipantDto);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyParticipantResponseDto })
  async create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreatePolicyParticipantDto,
  ): Promise<PolicyParticipantResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');
    const row = await prisma.policyParticipant.create({ data: { ...dto, policyId } });
    return toParticipantDto(row);
  }

  @Patch(':id')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyParticipantResponseDto })
  async update(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePolicyParticipantDto,
  ): Promise<PolicyParticipantResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.policyParticipant.findFirst({ where: { id, policyId } });
    if (!existing) throw new NotFoundException('Participant not found');
    const row = await prisma.policyParticipant.update({ where: { id }, data: dto });
    return toParticipantDto(row);
  }

  @Delete(':id')
  @RequirePermission('policy', 'write')
  async remove(@Param('policyId', ParseUUIDPipe) policyId: string, @Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.policyParticipant.findFirst({ where: { id, policyId } });
    if (!existing) throw new NotFoundException('Participant not found');
    await prisma.policyParticipant.delete({ where: { id } });
    return { deleted: true };
  }
}

function toAssetDto(row: PolicyAsset): PolicyAssetResponseDto {
  return { ...row, valuation: decimalToString(row.valuation), latitude: decimalToString(row.latitude), longitude: decimalToString(row.longitude) };
}

@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/assets')
export class PolicyAssetController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PolicyAssetResponseDto] })
  async list(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<PolicyAssetResponseDto[]> {
    const rows = await getPrismaClient().policyAsset.findMany({ where: { policyId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toAssetDto);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyAssetResponseDto })
  async create(@Param('policyId', ParseUUIDPipe) policyId: string, @Body() dto: CreatePolicyAssetDto): Promise<PolicyAssetResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');
    const row = await prisma.policyAsset.create({ data: { ...dto, policyId } });
    return toAssetDto(row);
  }

  @Patch(':id')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyAssetResponseDto })
  async update(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePolicyAssetDto,
  ): Promise<PolicyAssetResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.policyAsset.findFirst({ where: { id, policyId } });
    if (!existing) throw new NotFoundException('Asset not found');
    const row = await prisma.policyAsset.update({ where: { id }, data: dto });
    return toAssetDto(row);
  }

  @Delete(':id')
  @RequirePermission('policy', 'write')
  async remove(@Param('policyId', ParseUUIDPipe) policyId: string, @Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.policyAsset.findFirst({ where: { id, policyId } });
    if (!existing) throw new NotFoundException('Asset not found');
    await prisma.policyAsset.delete({ where: { id } });
    return { deleted: true };
  }
}
