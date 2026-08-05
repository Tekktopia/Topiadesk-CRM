import type { PrismaClient } from '@topiadesk/db';
import type { ZodType } from 'zod';

/**
 * The whole point of this file: a report is a fixed, server-defined
 * TypeScript function, never a client-supplied query string. `filterSchema`
 * validates+coerces the request body server-side (unknown keys rejected —
 * every schema below uses `.strict()`); `allowedDimensions` is a closed
 * enum of pivot keys, never a raw column/table name; `dimension` is passed
 * into `execute()` purely as data — see the per-report files for how it's
 * used to reshape already-fetched rows, never interpolated into SQL. See
 * SavedDashboard's schema.prisma doc comment for the constraint this
 * whole module exists to satisfy.
 */

export interface ReportDimension {
  key: string;
  label: string;
}

export type ReportMeasureAggregate = 'sum' | 'count' | 'avg';
export type ReportValueFormat = 'currency' | 'number' | 'percent' | 'days' | 'text' | 'date';

export interface ReportMeasure {
  key: string;
  label: string;
  aggregate: ReportMeasureAggregate;
  format: ReportValueFormat;
}

export interface ReportColumn {
  key: string;
  label: string;
  format: ReportValueFormat;
}

export type ReportCellValue = string | number | boolean | null;

export interface ReportResult {
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCellValue>>;
  /** Row count BEFORE any page slicing — distinct from rows.length once export/pagination trims the array. */
  totalRowCount: number;
  generatedAt: string;
}

export type ReportCategory = 'FINANCE' | 'SALES' | 'RENEWALS' | 'CLAIMS' | 'COMPLIANCE' | 'PRODUCTIVITY' | 'MARKETING';
export type ReportChartType = 'bar' | 'stackedBar' | 'line' | 'funnel' | 'table' | 'treemap' | 'gauge';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReportDefinition<TFilters = any> {
  key: string;
  name: string;
  description: string;
  category: ReportCategory;
  filterSchema: ZodType<TFilters>;
  allowedDimensions: ReportDimension[];
  measures: ReportMeasure[];
  defaultChartType: ReportChartType;
  /**
   * `prisma` is whatever RLS context the caller bound before invoking this —
   * the caller's own scoped context for an interactive `/reports/:key/run`
   * request, or SYSTEM_JOB_CONTEXT for the worker's scheduled dispatch (see
   * generate-and-deliver.job.ts). This function must never itself decide
   * which context applies; it just runs Prisma calls against whatever
   * client it's handed.
   */
  execute(prisma: PrismaClient, filters: TFilters, dimension?: string): Promise<ReportResult>;
}

/** Registered once at process boot (see definitions/index.ts) — a plain Map, not a NestJS provider, so both backend/api and backend/worker can use it identically. */
export class ReportRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly definitions = new Map<string, ReportDefinition<any>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(definition: ReportDefinition<any>): void {
    if (this.definitions.has(definition.key)) {
      throw new Error(`Duplicate report key registered: ${definition.key}`);
    }
    this.definitions.set(definition.key, definition);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(key: string): ReportDefinition<any> | undefined {
    return this.definitions.get(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list(): ReportDefinition<any>[] {
    return [...this.definitions.values()];
  }
}

/**
 * Shared post-query pivot: every report's `execute()` fetches rows already
 * grouped by ALL of its declared dimensions (never a dynamic SQL GROUP BY
 * driven by client input), then calls this to collapse down to just the
 * requested `dimension` when one is given. `countKey`, if the finest-grain
 * rows carry one, lets 'avg' measures re-aggregate as a correctly weighted
 * mean instead of a naive average-of-averages.
 */
export function pivotByDimension(
  rows: Array<Record<string, ReportCellValue>>,
  dimensionKey: string,
  measures: ReportMeasure[],
  countKeyByMeasure?: Partial<Record<string, string>>,
): Array<Record<string, ReportCellValue>> {
  const groups = new Map<string, { dimensionValue: ReportCellValue; sums: Record<string, number>; counts: Record<string, number> }>();

  for (const row of rows) {
    const dimensionValue = row[dimensionKey] ?? 'Unknown';
    const groupKey = String(dimensionValue);
    let group = groups.get(groupKey);
    if (!group) {
      group = { dimensionValue, sums: {}, counts: {} };
      groups.set(groupKey, group);
    }
    for (const measure of measures) {
      const raw = row[measure.key];
      const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
      const weight = countKeyByMeasure?.[measure.key] ? Number(row[countKeyByMeasure[measure.key]!] ?? 0) : 1;
      group.sums[measure.key] = (group.sums[measure.key] ?? 0) + (measure.aggregate === 'avg' ? value * weight : value);
      group.counts[measure.key] = (group.counts[measure.key] ?? 0) + weight;
    }
  }

  return [...groups.values()].map((group) => {
    const out: Record<string, ReportCellValue> = { [dimensionKey]: group.dimensionValue };
    for (const measure of measures) {
      if (measure.aggregate === 'avg') {
        const count = group.counts[measure.key] ?? 0;
        out[measure.key] = count > 0 ? Math.round((group.sums[measure.key]! / count) * 100) / 100 : 0;
      } else {
        out[measure.key] = Math.round((group.sums[measure.key] ?? 0) * 100) / 100;
      }
    }
    return out;
  });
}

export function buildReportResult(
  columns: ReportColumn[],
  rows: Array<Record<string, ReportCellValue>>,
): ReportResult {
  return { columns, rows, totalRowCount: rows.length, generatedAt: new Date().toISOString() };
}

/**
 * Column list for a report result: either every declared dimension (no
 * pivot requested) or just the one requested dimension, followed by all
 * measures — shared shape used by every report definition below so the
 * frontend's generic pivot-table renderer only has to understand one
 * columns contract.
 */
export function reportColumns(
  dimensions: ReportDimension[],
  measures: ReportMeasure[],
  dimension?: string,
): ReportColumn[] {
  const active = dimension && dimensions.some((d) => d.key === dimension) ? [dimension] : dimensions.map((d) => d.key);
  const dimensionColumns: ReportColumn[] = active.map((key) => ({
    key,
    label: dimensions.find((d) => d.key === key)?.label ?? key,
    format: 'text',
  }));
  return [...dimensionColumns, ...measures.map((m) => ({ key: m.key, label: m.label, format: m.format }))];
}

/** Applies pivotByDimension only when `dimension` is a real, declared dimension — otherwise returns the finest-grain rows untouched. */
export function reportRows(
  rows: Array<Record<string, ReportCellValue>>,
  dimensions: ReportDimension[],
  measures: ReportMeasure[],
  dimension?: string,
  countKeyByMeasure?: Partial<Record<string, string>>,
): Array<Record<string, ReportCellValue>> {
  if (dimension && dimensions.some((d) => d.key === dimension)) {
    return pivotByDimension(rows, dimension, measures, countKeyByMeasure);
  }
  return rows;
}
