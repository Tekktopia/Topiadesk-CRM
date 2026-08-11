import { type PrismaClient } from '@topiadesk/db';
import { buildDefaultRegistry, type ReportResult } from '@topiadesk/reports';

const registry = buildDefaultRegistry();

export interface DashboardWidgetSpec {
  id: string;
  title: string;
  reportKey: string;
  filters?: Record<string, unknown>;
  dimension?: string;
  /** User-chosen visualization override — falls back to the report definition's own `defaultChartType` when unset. Not validated server-side (an incompatible pairing just degrades to the existing client-side NotChartable fallback, same graceful-degradation precedent this function already uses for a stale reportKey or invalid filters). */
  chartType?: string;
}

export interface RenderedDashboardWidget {
  id: string;
  title: string;
  reportKey: string;
  chartType: string;
  result?: ReportResult;
  error?: string;
}

/**
 * Shared by RoleDashboardsController (4 fixed named routes) and
 * SavedDashboardsController (arbitrary user-owned dashboards, :id/render)
 * — "look up the row, execute() each referenced report" has no
 * per-dashboard business logic to fork, so this is the one place that
 * logic lives. A widget whose report key is stale or whose stored filters
 * no longer validate degrades to an inline `{ error }` for that one tile
 * rather than failing the whole dashboard.
 */
export async function renderDashboardWidget(prisma: PrismaClient, spec: DashboardWidgetSpec): Promise<RenderedDashboardWidget> {
  const definition = registry.get(spec.reportKey);
  if (!definition) {
    return { id: spec.id, title: spec.title, reportKey: spec.reportKey, chartType: 'table', error: `Unknown report key: ${spec.reportKey}` };
  }
  const chartType = spec.chartType ?? definition.defaultChartType;
  const parsed = definition.filterSchema.safeParse(spec.filters ?? {});
  if (!parsed.success) {
    return {
      id: spec.id,
      title: spec.title,
      reportKey: spec.reportKey,
      chartType,
      error: "Stored widget filters no longer validate against this report's filterSchema",
    };
  }
  try {
    const result = await definition.execute(prisma, parsed.data, spec.dimension);
    return { id: spec.id, title: spec.title, reportKey: spec.reportKey, chartType, result };
  } catch (err) {
    return { id: spec.id, title: spec.title, reportKey: spec.reportKey, chartType, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function renderDashboardWidgets(prisma: PrismaClient, widgets: unknown): Promise<RenderedDashboardWidget[]> {
  const specs = Array.isArray(widgets) ? (widgets as unknown as DashboardWidgetSpec[]) : [];
  return Promise.all(specs.map((spec) => renderDashboardWidget(prisma, spec)));
}
