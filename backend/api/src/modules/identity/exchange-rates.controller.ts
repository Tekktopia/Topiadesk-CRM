import { Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ExchangeRateResponseDto, UpsertExchangeRateDto } from './dto/exchange-rate.dto';

function toResponse(row: { id: string; currencyCode: string; rateToBase: { toString(): string }; updatedById: string | null; updatedAt: Date }): ExchangeRateResponseDto {
  return { id: row.id, currencyCode: row.currencyCode, rateToBase: row.rateToBase.toString(), updatedById: row.updatedById, updatedAt: row.updatedAt };
}

/** Multi-currency admin — see ExchangeRate's schema.prisma comment. Reads ungated (dashboards.controller.ts and every quote-entry form need these), writes gated on 'identity' (config-tier, same as field-permissions.controller.ts). */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/exchange-rates')
export class ExchangeRatesController {
  @Get()
  @ApiOkResponse({ type: [ExchangeRateResponseDto] })
  async list(): Promise<ExchangeRateResponseDto[]> {
    const rows = await getPrismaClient().exchangeRate.findMany({ orderBy: { currencyCode: 'asc' } });
    return rows.map(toResponse);
  }

  /** Upsert on currencyCode — one call sets or changes a rate, no separate create-vs-update the UI needs to track. */
  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: ExchangeRateResponseDto })
  async upsert(@Body() dto: UpsertExchangeRateDto, @CurrentUser() user: AuthenticatedUser): Promise<ExchangeRateResponseDto> {
    const code = dto.currencyCode.toUpperCase();
    const row = await getPrismaClient().exchangeRate.upsert({
      where: { currencyCode: code },
      create: { currencyCode: code, rateToBase: dto.rateToBase, updatedById: user.id },
      update: { rateToBase: dto.rateToBase, updatedById: user.id },
    });
    return toResponse(row);
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.exchangeRate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Exchange rate not found');
    await prisma.exchangeRate.delete({ where: { id } });
    return { deleted: true };
  }
}
