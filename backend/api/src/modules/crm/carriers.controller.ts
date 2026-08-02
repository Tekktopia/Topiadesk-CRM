import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CarrierResponseDto, CreateCarrierDto, UpdateCarrierDto } from './dto/carrier.dto';

/**
 * carriers has no RLS policy (prisma/rls/001_enable_rls.sql deliberately
 * omits it — supply-side reference data, open to any authenticated staff
 * member per docs/architecture.md). Reads are therefore ungated here
 * (authentication alone suffices); writes are gated on 'account' — no
 * dedicated 'carrier' permission resource is seeded (see crm module report).
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/carriers')
export class CarriersController {
  @Get()
  @ApiOkResponse({ type: [CarrierResponseDto] })
  async list(): Promise<CarrierResponseDto[]> {
    return getPrismaClient().carrier.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @ApiOkResponse({ type: CarrierResponseDto })
  async getOne(@Param('id') id: string): Promise<CarrierResponseDto> {
    const carrier = await getPrismaClient().carrier.findUnique({ where: { id } });
    if (!carrier) throw new NotFoundException('Carrier not found');
    return carrier;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: CarrierResponseDto })
  async create(@Body() dto: CreateCarrierDto): Promise<CarrierResponseDto> {
    return getPrismaClient().carrier.create({ data: { ...dto, linesOfBusiness: dto.linesOfBusiness ?? [] } });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: CarrierResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCarrierDto): Promise<CarrierResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.carrier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carrier not found');
    return prisma.carrier.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.carrier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carrier not found');
    await prisma.carrier.delete({ where: { id } });
    return { deleted: true };
  }
}
