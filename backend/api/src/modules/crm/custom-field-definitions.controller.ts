import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  CreateCustomFieldDefinitionDto,
  CustomFieldDefinitionQueryDto,
  CustomFieldDefinitionResponseDto,
  CustomFieldDefinitionStatsResponseDto,
  UpdateCustomFieldDefinitionDto,
} from './dto/custom-field-definition.dto';
import { customFieldDefinitionsToCsv } from './custom-field-csv';

/**
 * custom_field_definitions carries no RLS (org-wide config, same tier as
 * Carrier/Pipeline — see schema.prisma) — reads are ungated, writes are
 * gated on 'account' since no dedicated 'custom_field_definition' permission
 * resource is seeded (mirrors carriers.controller.ts / pipelines.controller.ts).
 *
 * DELETE soft-deletes (isActive=false) — never a hard delete, which would
 * orphan jsonb values already written under this key on live Account/
 * Contact/Lead/Opportunity rows.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/custom-field-definitions')
export class CustomFieldDefinitionsController {
  @Get()
  @ApiOkResponse({ type: [CustomFieldDefinitionResponseDto] })
  async list(@Query() query: CustomFieldDefinitionQueryDto): Promise<CustomFieldDefinitionResponseDto[]> {
    return getPrismaClient().customFieldDefinition.findMany({
      where: customFieldWhere(query),
      orderBy: [{ entityType: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  /**
   * Schema-wide aggregates over the same filter as the list. Ungated like
   * list() — this is org-wide config metadata, not tenant data.
   *
   * Must precede ':id' — Nest matches literal segments in declaration order.
   */
  @Get('stats')
  @ApiOkResponse({ type: CustomFieldDefinitionStatsResponseDto })
  async stats(@Query() query: CustomFieldDefinitionQueryDto): Promise<CustomFieldDefinitionStatsResponseDto> {
    const prisma = getPrismaClient();
    const where = customFieldWhere(query);

    // AND, never a spread-and-override: `{ ...where, isActive: true }`
    // REPLACES an isActive the caller already filtered on, so filtering to
    // "Deactivated" reported the unfiltered active count — and `inactive`,
    // being total - active, went NEGATIVE. Intersecting makes the impossible
    // combination return 0, which is what the filtered view actually holds.
    const [total, active, required, grouped] = await Promise.all([
      prisma.customFieldDefinition.count({ where }),
      prisma.customFieldDefinition.count({ where: { AND: [where, { isActive: true }] } }),
      prisma.customFieldDefinition.count({ where: { AND: [where, { isActive: true, isRequired: true }] } }),
      // Two groupBys would be a round trip each; one groupBy over
      // (entityType, isActive) gives both totals in a single query.
      prisma.customFieldDefinition.groupBy({
        by: ['entityType', 'isActive'],
        where,
        _count: { _all: true },
      }),
    ]);

    const byEntity = new Map<string, { entityType: string; total: number; active: number }>();
    for (const row of grouped) {
      const bucket = byEntity.get(row.entityType) ?? { entityType: row.entityType, total: 0, active: 0 };
      bucket.total += row._count._all;
      if (row.isActive) bucket.active += row._count._all;
      byEntity.set(row.entityType, bucket);
    }

    return {
      total,
      active,
      inactive: total - active,
      required,
      byEntityType: [...byEntity.values()].sort((a, b) => a.entityType.localeCompare(b.entityType)),
    };
  }

  /**
   * CSV of the tenant's custom-field schema over the current filter — what
   * gets handed to an integrator or an auditor. Must precede ':id'.
   */
  @Get('export')
  async export(@Query() query: CustomFieldDefinitionQueryDto, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const definitions = await getPrismaClient().customFieldDefinition.findMany({
      where: customFieldWhere(query),
      orderBy: [{ entityType: 'asc' }, { displayOrder: 'asc' }],
      take: 10_000,
    });
    const csv = customFieldDefinitionsToCsv(definitions);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="custom-fields.csv"' });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Get(':id')
  @ApiOkResponse({ type: CustomFieldDefinitionResponseDto })
  async getOne(@Param('id') id: string): Promise<CustomFieldDefinitionResponseDto> {
    const definition = await getPrismaClient().customFieldDefinition.findUnique({ where: { id } });
    if (!definition) throw new NotFoundException('CustomFieldDefinition not found');
    return definition;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: CustomFieldDefinitionResponseDto })
  async create(@Body() dto: CreateCustomFieldDefinitionDto): Promise<CustomFieldDefinitionResponseDto> {
    return getPrismaClient().customFieldDefinition.create({ data: dto });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: CustomFieldDefinitionResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDefinitionDto): Promise<CustomFieldDefinitionResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CustomFieldDefinition not found');
    return prisma.customFieldDefinition.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deactivated: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CustomFieldDefinition not found');
    await prisma.customFieldDefinition.update({ where: { id }, data: { isActive: false } });
    return { deactivated: true };
  }
}

/** Shared by list() and stats() so the header and the table always agree. */
function customFieldWhere(query: CustomFieldDefinitionQueryDto): Prisma.CustomFieldDefinitionWhereInput {
  return {
    entityType: query.entityType,
    fieldType: query.fieldType,
    // Undefined (not false) when the param is absent, so an omitted filter
    // means "both states", not "inactive only".
    isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
    ...(query.q
      ? {
          OR: [
            { label: { contains: query.q, mode: 'insensitive' as const } },
            { key: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}
