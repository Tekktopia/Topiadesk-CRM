import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient, Prisma } from '@topiadesk/db-platform';
import { CreatePlanDto, PlanResponseDto, UpdatePlanDto } from './dto/plan.dto';
import { PlatformAuditService } from './platform-audit.service';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import type { PlatformAdminContext } from './platform-context';
import { PlatformRoleGuard } from './platform-role.guard';
import { RequirePlatformRole } from './require-platform-role.decorator';

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformRoleGuard)
@Controller('platform/plans')
export class PlansController {
  constructor(private readonly auditService: PlatformAuditService) {}

  @Get()
  @ApiOkResponse({ type: [PlanResponseDto] })
  async list(): Promise<PlanResponseDto[]> {
    return getPlatformPrismaClient().plan.findMany({ orderBy: { seatLimit: 'asc' } });
  }

  @Post()
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: PlanResponseDto })
  async create(@Body() dto: CreatePlanDto, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<PlanResponseDto> {
    try {
      const plan = await getPlatformPrismaClient().plan.create({ data: dto });
      await this.auditService.recordEvent({
        actorPlatformAdminId: actor.id,
        action: 'CREATE_PLAN',
        entityType: 'plans',
        entityId: plan.id,
        detail: { name: dto.name, seatLimit: dto.seatLimit },
      });
      return plan;
    } catch (err) {
      if (isUniqueConstraintViolation(err)) throw new BadRequestException(`Plan "${dto.name}" already exists`);
      throw err;
    }
  }

  @Patch(':id')
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOkResponse({ type: PlanResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentPlatformAdmin() actor: PlatformAdminContext): Promise<PlanResponseDto> {
    const plan = await getPlatformPrismaClient().plan.update({ where: { id }, data: dto });
    await this.auditService.recordEvent({
      actorPlatformAdminId: actor.id,
      action: 'UPDATE_PLAN',
      entityType: 'plans',
      entityId: id,
      detail: dto as Record<string, unknown>,
    });
    return plan;
  }
}
