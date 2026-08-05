import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CUSTOM_REPORT_REGISTRY, getEntityOrThrow, getFieldOrThrow, type CustomReportField } from './custom-report-field-registry';
import { CustomReportEntityDto, CustomReportResultDto, RunCustomReportDto } from './dto/custom-report.dto';

/**
 * The ad-hoc "Custom Reports" builder — additive to the fixed 12-report
 * registry (reports.controller.ts), not a replacement. See
 * custom-report-field-registry.ts's header comment for the full
 * injection-safety argument this controller depends on: every entity/field
 * name that reaches a Prisma call below has already been checked against
 * CUSTOM_REPORT_REGISTRY (a hardcoded allow-list), so no request-supplied
 * string is ever used as a Prisma object key without that check passing
 * first. There is no raw SQL anywhere in this file.
 *
 * Mounted at `custom-reports`, a sibling of `reports`, not nested under it
 * (`reports/custom/...`) — discovered live: ReportsController's
 * `POST /reports/:key/run` is a dynamic route registered ahead of this
 * controller in ReportsModule, and Express/Nest matches routes in
 * registration order, not by static-vs-dynamic specificity. A nested
 * `reports/custom/run` path was silently swallowed by `:key/run` (with
 * `key` resolving to the literal string "custom") every time, validating
 * the body against the wrong DTO. A disjoint path segment removes the
 * ambiguity entirely rather than depending on controller registration
 * order staying correct forever.
 *

 * `getPrismaClient()[def.prismaModel]` is a deliberate, narrow `any` --
 * Prisma's generated client has no index signature for "arbitrary model
 * name string", which is exactly the point of this endpoint (the entity is
 * chosen at request time, from the allow-list, not known at compile time).
 * The safety property this endpoint provides comes from the allow-list
 * validation, not from TypeScript's type system.
 */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('custom-reports')
export class CustomReportController {
  @Get('entities')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: [CustomReportEntityDto] })
  listEntities(): CustomReportEntityDto[] {
    return Object.entries(CUSTOM_REPORT_REGISTRY).map(([entity, def]) => ({
      entity,
      label: def.label,
      fields: def.fields,
    }));
  }

  @Get('fields')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: CustomReportEntityDto })
  listFields(@Query('entity') entity: string): CustomReportEntityDto {
    const def = this.resolveEntity(entity);
    return { entity, label: def.label, fields: def.fields };
  }

  @Post('run')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: CustomReportResultDto })
  async run(@Body() dto: RunCustomReportDto): Promise<CustomReportResultDto> {
    const def = this.resolveEntity(dto.entity);

    const selectFields = dto.fields.map((key) => this.resolveField(def, key));
    const where = this.buildWhere(def, dto.filters ?? []);
    const groupByFields = (dto.groupBy ?? []).map((key) => {
      const field = this.resolveField(def, key);
      if (!field.groupable) throw new BadRequestException(`Field "${key}" is not groupable`);
      return field;
    });

    // getPrismaClient()[def.prismaModel] is validated above (resolveEntity
    // only accepts keys of CUSTOM_REPORT_REGISTRY) — see header comment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (getPrismaClient() as any)[def.prismaModel];

    if (groupByFields.length > 0) {
      const byFields = groupByFields.map((f) => f.prismaField);
      const rows = await delegate.groupBy({
        by: byFields,
        where,
        _count: { _all: true },
        // Prisma's groupBy requires an explicit orderBy referencing only
        // `by`-listed fields whenever take/skip are used (discovered live:
        // omitting it throws "Every field used for orderBy must be
        // included in the by-arguments... Missing fields: id" — Prisma
        // silently assumes an id-based default order otherwise). Ordering
        // by the grouped fields themselves is always valid and safe here.
        orderBy: byFields.map((field) => ({ [field]: 'asc' as const })),
        take: dto.take ?? 50,
        skip: dto.skip ?? 0,
      });
      return {
        rows: rows.map((row: Record<string, unknown>) => ({ ...row, _count: (row._count as { _all: number })._all })),
        totalCount: rows.length,
      };
    }

    const select: Record<string, boolean> = {};
    for (const field of selectFields) select[field.prismaField] = true;

    const [rows, totalCount] = await Promise.all([
      delegate.findMany({ where, select, take: dto.take ?? 50, skip: dto.skip ?? 0 }),
      delegate.count({ where }),
    ]);
    return { rows, totalCount };
  }

  private resolveEntity(entity: string) {
    try {
      return getEntityOrThrow(entity);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid entity');
    }
  }

  private resolveField(def: ReturnType<typeof getEntityOrThrow>, key: string): CustomReportField {
    try {
      return getFieldOrThrow(def, key);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid field');
    }
  }

  private buildWhere(def: ReturnType<typeof getEntityOrThrow>, filters: RunCustomReportDto['filters']): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    for (const filter of filters ?? []) {
      const field = this.resolveField(def, filter.field);
      if (!field.filterable) throw new BadRequestException(`Field "${filter.field}" is not filterable`);
      where[field.prismaField] = this.buildCondition(field, filter.operator, filter.value);
    }
    return where;
  }

  private buildCondition(field: CustomReportField, operator: string, rawValue: unknown): unknown {
    if (operator === 'in') {
      if (!Array.isArray(rawValue)) throw new BadRequestException(`"in" requires an array value for field "${field.key}"`);
      return { in: rawValue.map((v) => this.coerce(field, v)) };
    }
    const value = this.coerce(field, rawValue);
    switch (operator) {
      case 'eq':
        return { equals: value };
      case 'neq':
        return { not: value };
      case 'gt':
        return { gt: value };
      case 'lt':
        return { lt: value };
      case 'gte':
        return { gte: value };
      case 'lte':
        return { lte: value };
      case 'contains':
        if (field.type !== 'string' && field.type !== 'enum') {
          throw new BadRequestException(`"contains" only applies to text fields, not "${field.key}"`);
        }
        return { contains: String(value), mode: 'insensitive' };
      default:
        throw new BadRequestException(`Unknown operator "${operator}"`);
    }
  }

  private coerce(field: CustomReportField, value: unknown): unknown {
    switch (field.type) {
      case 'number': {
        const n = Number(value);
        if (Number.isNaN(n)) throw new BadRequestException(`Invalid number for field "${field.key}": ${String(value)}`);
        return n;
      }
      case 'date': {
        const d = new Date(String(value));
        if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date for field "${field.key}": ${String(value)}`);
        return d;
      }
      case 'boolean':
        return value === true || value === 'true';
      default:
        return String(value);
    }
  }
}
