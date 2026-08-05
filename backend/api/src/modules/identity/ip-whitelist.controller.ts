import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateIpWhitelistEntryDto, IpWhitelistEntryResponseDto, UpdateIpWhitelistEntryDto } from './dto/ip-whitelist.dto';
import { rethrowAsHttpException } from './prisma-error.util';
import { invalidateIpWhitelistCache } from './ip-whitelist-cache';

/**
 * Admin CRUD. Enforcement now exists (ip-whitelist.guard.ts + IP_WHITELIST_
 * ENFORCED) — see that guard's header comment for why it's a global
 * APP_GUARD, not middleware registered here. Every write below invalidates
 * the guard's short-TTL Redis cache so a change takes effect immediately
 * rather than waiting out the TTL.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/ip-whitelist')
export class IpWhitelistController {
  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [IpWhitelistEntryResponseDto] })
  async list(): Promise<IpWhitelistEntryResponseDto[]> {
    return getPrismaClient().ipWhitelistEntry.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: IpWhitelistEntryResponseDto })
  async get(@Param('id') id: string): Promise<IpWhitelistEntryResponseDto> {
    const entry = await getPrismaClient().ipWhitelistEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('IP whitelist entry not found');
    return entry;
  }

  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: IpWhitelistEntryResponseDto })
  async create(@Body() dto: CreateIpWhitelistEntryDto): Promise<IpWhitelistEntryResponseDto> {
    try {
      const created = await getPrismaClient().ipWhitelistEntry.create({ data: dto });
      await invalidateIpWhitelistCache();
      return created;
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: IpWhitelistEntryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateIpWhitelistEntryDto): Promise<IpWhitelistEntryResponseDto> {
    try {
      const updated = await getPrismaClient().ipWhitelistEntry.update({ where: { id }, data: dto });
      await invalidateIpWhitelistCache();
      return updated;
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await getPrismaClient().ipWhitelistEntry.delete({ where: { id } });
      await invalidateIpWhitelistCache();
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }
}
