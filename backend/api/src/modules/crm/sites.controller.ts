import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateSiteDto, SiteResponseDto, UpdateSiteDto } from './dto/site.dto';

/**
 * A corporate account's separate branches/locations — nested under its
 * parent Account (same shape as premium.controller.ts's
 * PolicyPremiumController nested under Policy). Gated by the same
 * 'account' permission the parent Account itself uses — a Site is config
 * on the account, not an independently-owned resource — and inherits the
 * account's RLS scoping (sites_rw, prisma/rls/002_policies.sql) rather than
 * any manual owner filter here.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/accounts/:accountId/sites')
export class SitesController {
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [SiteResponseDto] })
  async list(@Param('accountId') accountId: string): Promise<SiteResponseDto[]> {
    return getPrismaClient().site.findMany({ where: { accountId }, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: SiteResponseDto })
  async create(@Param('accountId') accountId: string, @Body() dto: CreateSiteDto): Promise<SiteResponseDto> {
    const prisma = getPrismaClient();
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true } });
    if (!account) throw new NotFoundException('Account not found');
    return prisma.site.create({
      data: {
        accountId,
        name: dto.name,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        postalCode: dto.postalCode,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: SiteResponseDto })
  async update(@Param('accountId') accountId: string, @Param('id') id: string, @Body() dto: UpdateSiteDto): Promise<SiteResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.site.findFirst({ where: { id, accountId } });
    if (!existing) throw new NotFoundException('Site not found');
    return prisma.site.update({
      where: { id },
      data: {
        name: dto.name,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        postalCode: dto.postalCode,
        isPrimary: dto.isPrimary,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('accountId') accountId: string, @Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.site.findFirst({ where: { id, accountId } });
    if (!existing) throw new NotFoundException('Site not found');
    await prisma.site.delete({ where: { id } });
    return { deleted: true };
  }
}
