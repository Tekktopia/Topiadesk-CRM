import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type ProducerCommission } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateProducerCommissionDto, ProducerCommissionResponseDto, UpdateProducerCommissionDto } from './dto/producer-commission.dto';
import { decimalToString } from './decimal.util';

function toDto(row: ProducerCommission): ProducerCommissionResponseDto {
  return {
    ...row,
    premiumBase: decimalToString(row.premiumBase),
    commissionPercent: decimalToString(row.commissionPercent),
    commissionAmount: decimalToString(row.commissionAmount),
    vatAmount: decimalToString(row.vatAmount),
    whtAmount: decimalToString(row.whtAmount),
    netPayable: decimalToString(row.netPayable),
  };
}

/**
 * Top-level — filterable list (producer/status/period) plus create and the
 * PENDING -> APPROVED -> PAID status transition via PATCH (same "generic
 * update carries the status move" shape as PremiumController.update, rather
 * than separate /approve and /mark-paid action routes). Gated on the
 * dedicated 'producer_commission' resource, not 'policy' — per
 * prisma/rls/002_policies.sql's comment, commission $ amounts need
 * independently-tunable visibility from the policy record itself (e.g. a
 * line broker who can read a policy shouldn't automatically see what it
 * pays another producer).
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('producer-commissions')
export class ProducerCommissionsController {
  @Get()
  @RequirePermission('producer_commission', 'read')
  @ApiOkResponse({ type: [ProducerCommissionResponseDto] })
  async list(
    @Query('producerId') producerId?: string,
    @Query('policyId') policyId?: string,
    @Query('status') status?: string,
    @Query('period') period?: string,
  ): Promise<ProducerCommissionResponseDto[]> {
    const rows = await getPrismaClient().producerCommission.findMany({
      where: {
        producerId: producerId ?? undefined,
        policyId: policyId ?? undefined,
        status: (status as ProducerCommission['status']) ?? undefined,
        period: period ?? undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  @Get(':id')
  @RequirePermission('producer_commission', 'read')
  @ApiOkResponse({ type: ProducerCommissionResponseDto })
  async getOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProducerCommissionResponseDto> {
    const row = await getPrismaClient().producerCommission.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Producer commission not found');
    return toDto(row);
  }

  @Post()
  @RequirePermission('producer_commission', 'write')
  @ApiOkResponse({ type: ProducerCommissionResponseDto })
  async create(@Body() dto: CreateProducerCommissionDto): Promise<ProducerCommissionResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: dto.policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');

    const row = await prisma.producerCommission.create({
      data: {
        commissionNumber: dto.commissionNumber,
        policyId: dto.policyId,
        producerId: dto.producerId,
        premiumId: dto.premiumId,
        premiumBase: dto.premiumBase,
        commissionPercent: dto.commissionPercent,
        commissionAmount: dto.commissionAmount,
        vatAmount: dto.vatAmount ?? '0',
        whtAmount: dto.whtAmount ?? '0',
        netPayable: dto.netPayable,
        period: dto.period,
      },
    });
    return toDto(row);
  }

  @Patch(':id')
  @RequirePermission('producer_commission', 'write')
  @ApiOkResponse({ type: ProducerCommissionResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProducerCommissionDto): Promise<ProducerCommissionResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.producerCommission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Producer commission not found');

    const row = await prisma.producerCommission.update({
      where: { id },
      data: {
        premiumBase: dto.premiumBase,
        commissionPercent: dto.commissionPercent,
        commissionAmount: dto.commissionAmount,
        vatAmount: dto.vatAmount,
        whtAmount: dto.whtAmount,
        netPayable: dto.netPayable,
        period: dto.period,
        status: dto.status,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
      },
    });
    return toDto(row);
  }
}
