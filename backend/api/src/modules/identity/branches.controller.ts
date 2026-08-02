import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { BranchResponseDto, CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { rethrowAsHttpException } from './prisma-error.util';

/** Reference data feeding RLS's branch scoping — same no-RLS-on-this-table story as departments.controller.ts. */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/branches')
export class BranchesController {
  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [BranchResponseDto] })
  async list(): Promise<BranchResponseDto[]> {
    return getPrismaClient().branch.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: BranchResponseDto })
  async get(@Param('id') id: string): Promise<BranchResponseDto> {
    const branch = await getPrismaClient().branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: BranchResponseDto })
  async create(@Body() dto: CreateBranchDto): Promise<BranchResponseDto> {
    try {
      return await getPrismaClient().branch.create({ data: dto });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: BranchResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateBranchDto): Promise<BranchResponseDto> {
    try {
      return await getPrismaClient().branch.update({ where: { id }, data: dto });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await getPrismaClient().branch.delete({ where: { id } });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }
}
