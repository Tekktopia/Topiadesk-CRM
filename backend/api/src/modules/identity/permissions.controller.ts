import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { ListPermissionsQueryDto, PermissionResponseDto } from './dto/permission.dto';

/** Read-only: the resource/action/scope grid is seed-managed (prisma/seed.ts). Grant/revoke happens on a Role via roles.controller.ts. */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/permissions')
export class PermissionsController {
  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [PermissionResponseDto] })
  async list(@Query() query: ListPermissionsQueryDto): Promise<PermissionResponseDto[]> {
    return getPrismaClient().permission.findMany({
      where: query.resource ? { resource: query.resource } : undefined,
      orderBy: [{ resource: 'asc' }, { action: 'asc' }, { scope: 'asc' }],
    });
  }
}
