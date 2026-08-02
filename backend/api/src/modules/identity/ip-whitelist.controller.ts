import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateIpWhitelistEntryDto, IpWhitelistEntryResponseDto, UpdateIpWhitelistEntryDto } from './dto/ip-whitelist.dto';
import { rethrowAsHttpException } from './prisma-error.util';

/**
 * Admin CRUD only — enforcement is a separate, not-yet-built piece (app-
 * layer middleware reading a Redis-cached copy of this table, per the
 * schema comment on IpWhitelistEntry; .env.example's IP_WHITELIST_ENFORCED
 * flag gates whether that middleware is even wired in). Building that
 * middleware is out of scope here per the task brief.
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
      return await getPrismaClient().ipWhitelistEntry.create({ data: dto });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: IpWhitelistEntryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateIpWhitelistEntryDto): Promise<IpWhitelistEntryResponseDto> {
    try {
      return await getPrismaClient().ipWhitelistEntry.update({ where: { id }, data: dto });
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
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }
}
