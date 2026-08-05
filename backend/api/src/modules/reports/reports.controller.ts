import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { zodToJsonSchema as zodToJsonSchemaTyped } from 'zod-to-json-schema';

/**
 * Re-typed with a plain, non-generic signature before use — calling
 * zod-to-json-schema's own (generically typed) export directly on a
 * ReportDefinition<any>-sourced ZodType hits TS2589 ("Type instantiation
 * is excessively deep and possibly infinite"), reproducible even with the
 * input cast to zod's own ZodTypeAny escape hatch or routed through
 * `unknown` — the recursion is in resolving the CALL's own inferred return
 * type, not in comparing the argument. Since every report's filterSchema
 * is validated at runtime by zod itself (`.safeParse`/`.parse` elsewhere in
 * this module), nothing here relies on static type-checking of the JSON
 * Schema shape — this is purely a doc-generation helper, so a plain
 * `unknown -> Record<string, unknown>` signature loses nothing real.
 */
const zodToJsonSchema = zodToJsonSchemaTyped as (schema: unknown) => Record<string, unknown>;
import { getPrismaClient } from '@topiadesk/db';
import {
  buildDefaultRegistry,
  getReportDownloadUrl,
  renderReportExport,
  uploadReportFile,
  type ReportDefinition,
  type ReportResult,
} from '@topiadesk/reports';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { ReportCatalogEntryDto, ReportResultDto } from './dto/report-catalog.dto';
import { ExportReportQueryDto, ReportDownloadResponseDto, RunReportDto } from './dto/run-report.dto';

/**
 * Built once at module load — see registry/report-definition.ts's re-export
 * comment for why the real registry lives in @topiadesk/reports rather than
 * here. Every execute() call below runs against getPrismaClient(), which is
 * RLS-scoped to whatever context RlsContextMiddleware bound for THIS
 * request (the interactive caller's own visibility) — never SYSTEM_JOB.
 * Contrast with backend/worker/src/jobs/scheduled-reports/
 * generate-and-deliver.job.ts, which always runs under SYSTEM_JOB_CONTEXT
 * (gotcha #4 in the module brief).
 */
const registry = buildDefaultRegistry();

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('reports')
export class ReportsController {
  @Get()
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: [ReportCatalogEntryDto] })
  listCatalog(): ReportCatalogEntryDto[] {
    return registry.list().map(toReportCatalogEntryDto);
  }

  @Post(':key/run')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: ReportResultDto })
  async run(@Param('key') key: string, @Body() dto: RunReportDto): Promise<ReportResultDto> {
    const definition = this.getDefinitionOrThrow(key);
    const filters = this.parseFilters(definition, dto.filters);
    this.assertValidDimension(definition, dto.dimension);

    const result = await definition.execute(getPrismaClient(), filters, dto.dimension);
    return this.paginate(result, dto.page, dto.pageSize);
  }

  @Get(':key/export')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: ReportDownloadResponseDto })
  async export(@Param('key') key: string, @Query() query: ExportReportQueryDto): Promise<ReportDownloadResponseDto> {
    const definition = this.getDefinitionOrThrow(key);
    const rawFilters = query.filters ? this.parseJsonFilters(query.filters) : {};
    const filters = this.parseFilters(definition, rawFilters);
    this.assertValidDimension(definition, query.dimension);

    // No arbitrary row-count cap, per the brief — this runs the report's
    // full execute() (whatever RLS-scoped rows the caller can see), not a
    // paginated slice like POST .../run supports for the interactive
    // pivot-table view.
    const result = await definition.execute(getPrismaClient(), filters, query.dimension);
    const buffer = await renderReportExport(result, query.format, definition.name);

    // Not tied to a ScheduledReportRun — this is an ad-hoc, on-demand
    // export, so it gets its own storage-key namespace (a fresh uuid)
    // rather than reusing scheduled-report-run bookkeeping.
    const uploaded = await uploadReportFile(randomUUID(), key, query.format, buffer);
    const expiresInSeconds = 300;
    const downloadUrl = await getReportDownloadUrl(uploaded.bucket, uploaded.key, expiresInSeconds);
    return { downloadUrl, rowCount: result.totalRowCount, expiresInSeconds };
  }

  private getDefinitionOrThrow(key: string): ReportDefinition {
    const definition = registry.get(key);
    if (!definition) throw new NotFoundException(`Unknown report key: ${key}`);
    return definition;
  }

  private assertValidDimension(definition: ReportDefinition, dimension: string | undefined): void {
    if (dimension && !definition.allowedDimensions.some((d) => d.key === dimension)) {
      throw new BadRequestException(`Unknown dimension "${dimension}" for report "${definition.key}" — must be one of: ${definition.allowedDimensions.map((d) => d.key).join(', ')}`);
    }
  }

  /** Unknown filter keys are rejected here (every report's filterSchema uses .strict()) — this is the enforcement point for "never raw SQL/query strings from the frontend": filters are always validated against a fixed, server-defined shape before execute() ever sees them. */
  private parseFilters(definition: ReportDefinition, raw: unknown): unknown {
    const parsed = definition.filterSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new BadRequestException(`Invalid filters for report "${definition.key}": ${issues}`);
    }
    return parsed.data;
  }

  private parseJsonFilters(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      throw new BadRequestException('filters query param must be valid JSON');
    }
  }

  private paginate(result: ReportResult, page?: number, pageSize?: number): ReportResult {
    if (!page && !pageSize) return result;
    const size = pageSize ?? 50;
    const start = ((page ?? 1) - 1) * size;
    return { ...result, rows: result.rows.slice(start, start + size) };
  }
}

/**
 * Standalone (not an inline `.map()` lambda) with an explicit parameter
 * type — passing `definition.filterSchema` (typed `ZodType<any>` via
 * ReportDefinition's default generic) into zod-to-json-schema from inside
 * an inline lambda whose return value also has to satisfy
 * `ReportCatalogEntryDto[]` triggered TS2589 ("Type instantiation is
 * excessively deep and possibly infinite") — the combination of
 * contextual typing from the outer array type plus zod-to-json-schema's
 * own generic recursion was too much for the checker. Breaking it into a
 * named function with its own explicit signature (and casting the zod
 * schema to `ZodTypeAny`, zod's documented loose base type) resolves it.
 */
function toReportCatalogEntryDto(definition: ReportDefinition): ReportCatalogEntryDto {
  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    filterSchema: zodToJsonSchema(definition.filterSchema),
    allowedDimensions: definition.allowedDimensions,
    measures: definition.measures,
    defaultChartType: definition.defaultChartType,
  };
}
