import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CreateTaskDto, TaskQueryDto, TaskResponseDto, UpdateTaskDto } from './dto/task.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/tasks')
export class TasksController {
  @Get()
  @RequirePermission('task', 'read')
  @ApiOkResponse({ type: [TaskResponseDto] })
  async list(@Query() query: TaskQueryDto): Promise<TaskResponseDto[]> {
    return getPrismaClient().task.findMany({
      where: {
        assigneeId: query.assigneeId,
        status: query.status,
        dueDate: dueDateFilter(query.dueBefore, query.dueAfter),
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  // Must precede ':id' — Nest matches literal segments in declaration order
  // ahead of a dynamic param competing for the same position.
  @Get('mine')
  @RequirePermission('task', 'read')
  @ApiOkResponse({ type: [TaskResponseDto] })
  async listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: TaskQueryDto): Promise<TaskResponseDto[]> {
    return getPrismaClient().task.findMany({
      where: {
        assigneeId: user.id,
        status: query.status,
        dueDate: dueDateFilter(query.dueBefore, query.dueAfter),
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  @Get(':id')
  @RequirePermission('task', 'read')
  @ApiOkResponse({ type: TaskResponseDto })
  async getOne(@Param('id') id: string): Promise<TaskResponseDto> {
    const task = await getPrismaClient().task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  @Post()
  @RequirePermission('task', 'write')
  @ApiOkResponse({ type: TaskResponseDto })
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser): Promise<TaskResponseDto> {
    return getPrismaClient().task.create({
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
        status: dto.status,
        assigneeId: dto.assigneeId ?? user.id,
        accountId: dto.accountId,
        policyId: dto.policyId,
        opportunityId: dto.opportunityId,
        leadId: dto.leadId,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('task', 'write')
  @ApiOkResponse({ type: TaskResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto): Promise<TaskResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    // completedAt tracks status transitions unless the caller isn't touching
    // status at all, in which case leave it untouched.
    let completedAt: Date | null | undefined;
    if (dto.status !== undefined && dto.status !== existing.status) {
      completedAt = dto.status === 'COMPLETED' ? new Date() : null;
    }

    return prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
        status: dto.status,
        assigneeId: dto.assigneeId,
        accountId: dto.accountId,
        policyId: dto.policyId,
        opportunityId: dto.opportunityId,
        leadId: dto.leadId,
        completedAt,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('task', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    await prisma.task.delete({ where: { id } });
    return { deleted: true };
  }
}

function dueDateFilter(dueBefore?: string, dueAfter?: string): Prisma.DateTimeFilter | undefined {
  if (!dueBefore && !dueAfter) return undefined;
  return {
    ...(dueBefore ? { lte: new Date(dueBefore) } : {}),
    ...(dueAfter ? { gte: new Date(dueAfter) } : {}),
  };
}
