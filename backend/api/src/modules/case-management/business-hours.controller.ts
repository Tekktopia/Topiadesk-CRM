import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  BusinessHolidayResponseDto,
  BusinessHoursCalendarResponseDto,
  CreateBusinessHolidayDto,
  CreateBusinessHoursCalendarDto,
  UpdateBusinessHolidayDto,
  UpdateBusinessHoursCalendarDto,
} from './dto/business-hours.dto';

/** Same 'sla_config' admin-authored tier as sla-policies.controller.ts — see its header comment. */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('business-hours-calendars')
export class BusinessHoursController {
  @Get()
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [BusinessHoursCalendarResponseDto] })
  async list(): Promise<BusinessHoursCalendarResponseDto[]> {
    return getPrismaClient().businessHoursCalendar.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: BusinessHoursCalendarResponseDto })
  async getOne(@Param('id') id: string): Promise<BusinessHoursCalendarResponseDto> {
    const calendar = await getPrismaClient().businessHoursCalendar.findUnique({ where: { id } });
    if (!calendar) throw new NotFoundException('BusinessHoursCalendar not found');
    return calendar;
  }

  @Get(':id/holidays')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [BusinessHolidayResponseDto] })
  async listHolidays(@Param('id') id: string): Promise<BusinessHolidayResponseDto[]> {
    return getPrismaClient().businessHoliday.findMany({ where: { calendarId: id }, orderBy: { date: 'asc' } });
  }

  @Post()
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: BusinessHoursCalendarResponseDto })
  async create(@Body() dto: CreateBusinessHoursCalendarDto): Promise<BusinessHoursCalendarResponseDto> {
    return getPrismaClient().businessHoursCalendar.create({
      data: { name: dto.name, timezone: dto.timezone, weeklyHours: dto.weeklyHours as unknown as Prisma.InputJsonValue, isDefault: dto.isDefault },
    });
  }

  @Patch(':id')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: BusinessHoursCalendarResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateBusinessHoursCalendarDto): Promise<BusinessHoursCalendarResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.businessHoursCalendar.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BusinessHoursCalendar not found');
    return prisma.businessHoursCalendar.update({
      where: { id },
      data: { name: dto.name, timezone: dto.timezone, weeklyHours: dto.weeklyHours as unknown as Prisma.InputJsonValue | undefined, isDefault: dto.isDefault },
    });
  }

  @Delete(':id')
  @RequirePermission('sla_config', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.businessHoursCalendar.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BusinessHoursCalendar not found');
    await prisma.businessHoursCalendar.delete({ where: { id } });
    return { deleted: true };
  }

  @Post(':id/holidays')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: BusinessHolidayResponseDto })
  async addHoliday(@Param('id') id: string, @Body() dto: CreateBusinessHolidayDto): Promise<BusinessHolidayResponseDto> {
    const prisma = getPrismaClient();
    const calendar = await prisma.businessHoursCalendar.findUnique({ where: { id } });
    if (!calendar) throw new NotFoundException('BusinessHoursCalendar not found');
    return prisma.businessHoliday.create({ data: { calendarId: id, date: new Date(dto.date), name: dto.name } });
  }

  @Patch(':id/holidays/:holidayId')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: BusinessHolidayResponseDto })
  async updateHoliday(@Param('id') id: string, @Param('holidayId') holidayId: string, @Body() dto: UpdateBusinessHolidayDto): Promise<BusinessHolidayResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.businessHoliday.findFirst({ where: { id: holidayId, calendarId: id } });
    if (!existing) throw new NotFoundException('BusinessHoliday not found');
    return prisma.businessHoliday.update({ where: { id: holidayId }, data: { date: dto.date ? new Date(dto.date) : undefined, name: dto.name } });
  }

  @Delete(':id/holidays/:holidayId')
  @RequirePermission('sla_config', 'write')
  async removeHoliday(@Param('id') id: string, @Param('holidayId') holidayId: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.businessHoliday.findFirst({ where: { id: holidayId, calendarId: id } });
    if (!existing) throw new NotFoundException('BusinessHoliday not found');
    await prisma.businessHoliday.delete({ where: { id: holidayId } });
    return { deleted: true };
  }
}
