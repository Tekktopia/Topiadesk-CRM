import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateDepartmentDto, DepartmentResponseDto, UpdateDepartmentDto } from './dto/department.dto';
import { rethrowAsHttpException } from './prisma-error.util';

/** Reference data feeding RLS's department scoping (app_can_access_owner in prisma/rls/002_policies.sql) — no RLS policy exists on this table itself (org-wide reference data), so authorization here is app-guard-only. */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/departments')
export class DepartmentsController {
  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [DepartmentResponseDto] })
  async list(): Promise<DepartmentResponseDto[]> {
    return getPrismaClient().department.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: DepartmentResponseDto })
  async get(@Param('id') id: string): Promise<DepartmentResponseDto> {
    const department = await getPrismaClient().department.findUnique({ where: { id } });
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: DepartmentResponseDto })
  async create(@Body() dto: CreateDepartmentDto): Promise<DepartmentResponseDto> {
    try {
      return await getPrismaClient().department.create({ data: dto });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: DepartmentResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto): Promise<DepartmentResponseDto> {
    try {
      return await getPrismaClient().department.update({ where: { id }, data: dto });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await getPrismaClient().department.delete({ where: { id } });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }
}
