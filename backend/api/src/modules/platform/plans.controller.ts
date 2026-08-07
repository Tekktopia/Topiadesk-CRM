import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient, Prisma } from '@topiadesk/db-platform';
import { CreatePlanDto, PlanResponseDto, UpdatePlanDto } from './dto/plan.dto';

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/plans')
export class PlansController {
  @Get()
  @ApiOkResponse({ type: [PlanResponseDto] })
  async list(): Promise<PlanResponseDto[]> {
    return getPlatformPrismaClient().plan.findMany({ orderBy: { seatLimit: 'asc' } });
  }

  @Post()
  @ApiOkResponse({ type: PlanResponseDto })
  async create(@Body() dto: CreatePlanDto): Promise<PlanResponseDto> {
    try {
      return await getPlatformPrismaClient().plan.create({ data: dto });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) throw new BadRequestException(`Plan "${dto.name}" already exists`);
      throw err;
    }
  }

  @Patch(':id')
  @ApiOkResponse({ type: PlanResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto): Promise<PlanResponseDto> {
    return getPlatformPrismaClient().plan.update({ where: { id }, data: dto });
  }
}
