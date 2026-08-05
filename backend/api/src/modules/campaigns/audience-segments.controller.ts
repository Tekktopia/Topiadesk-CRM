import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, getRlsContext, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  AudienceSegmentResponseDto,
  CreateAudienceSegmentDto,
  PreviewAudienceSegmentDto,
  SegmentPreviewResponseDto,
  UpdateAudienceSegmentDto,
} from './dto/audience-segment.dto';
import { buildContactWhereFromFilters, type SegmentFilterGroupInput } from './segment-filters';

const PREVIEW_SAMPLE_SIZE = 20;

/**
 * AudienceSegment.filters is validated and compiled by segment-filters.ts's
 * fixed allowlist — never trusted/interpreted as a raw query. See that
 * file's header comment for why the allowlist reaches into Policy/
 * RenewalSchedule/Premium/Opportunity, not just Contact/Account.
 */
@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('audience-segments')
export class AudienceSegmentsController {
  @Get()
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: [AudienceSegmentResponseDto] })
  async list(): Promise<AudienceSegmentResponseDto[]> {
    return getPrismaClient().audienceSegment.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: AudienceSegmentResponseDto })
  async getOne(@Param('id') id: string): Promise<AudienceSegmentResponseDto> {
    const segment = await getPrismaClient().audienceSegment.findUnique({ where: { id } });
    if (!segment) throw new NotFoundException('Audience segment not found');
    return segment;
  }

  @Post()
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: AudienceSegmentResponseDto })
  async create(@Body() dto: CreateAudienceSegmentDto): Promise<AudienceSegmentResponseDto> {
    // Validates now (compile-time-of-the-filters, not just at preview/send)
    // so a malformed segment can never be saved in the first place.
    buildContactWhereFromFilters(dto.filters as SegmentFilterGroupInput);

    const ctx = getRlsContext();
    return getPrismaClient().audienceSegment.create({
      data: {
        name: dto.name,
        description: dto.description,
        filters: dto.filters as unknown as Prisma.InputJsonValue,
        isDynamic: dto.isDynamic ?? true,
        ownerId: dto.ownerId ?? ctx?.userId,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: AudienceSegmentResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateAudienceSegmentDto): Promise<AudienceSegmentResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.audienceSegment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Audience segment not found');
    if (dto.filters) buildContactWhereFromFilters(dto.filters as SegmentFilterGroupInput);

    return prisma.audienceSegment.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        filters: dto.filters ? (dto.filters as unknown as Prisma.InputJsonValue) : undefined,
        isDynamic: dto.isDynamic,
        ownerId: dto.ownerId,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('campaign', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.audienceSegment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Audience segment not found');
    await prisma.audienceSegment.delete({ where: { id } });
    return { deleted: true };
  }

  @Post(':id/preview')
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: SegmentPreviewResponseDto })
  async preview(@Param('id') id: string, @Body() dto: PreviewAudienceSegmentDto): Promise<SegmentPreviewResponseDto> {
    const prisma = getPrismaClient();
    const segment = await prisma.audienceSegment.findUnique({ where: { id } });
    if (!segment) throw new NotFoundException('Audience segment not found');

    const filters = (dto.filters ?? (segment.filters as unknown as SegmentFilterGroupInput)) as SegmentFilterGroupInput;
    const where = buildContactWhereFromFilters(filters);

    const [count, sample] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        take: PREVIEW_SAMPLE_SIZE,
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, accountId: true },
      }),
    ]);

    return { count, sample };
  }
}
