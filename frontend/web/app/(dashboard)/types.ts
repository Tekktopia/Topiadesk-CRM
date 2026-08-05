/**
 * Response shapes for this feature's own composed Route Handlers
 * (app/api/dashboard/pipeline-funnel, app/api/dashboard/renewals) — these
 * have no single backend endpoint / OpenAPI operation to derive a type
 * from (see each route.ts's header comment), so unlike app/(policy)/lib/types.ts
 * these are hand-written to match the route handler's own response shape,
 * kept in the same file/module as a matter of convenience since both ends
 * are owned by this feature area.
 */

export interface FunnelStage {
  stageId: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  count: number;
  value: number;
}
export interface PipelineFunnelResponse {
  pipelineId: string | null;
  pipelineName: string | null;
  stages: FunnelStage[];
}

export interface RenewalRow {
  policyId: string;
  policyNumber: string;
  accountId: string;
  accountName: string;
  lineOfBusiness: string;
  renewalDueDate: string;
  renewalStatus: string;
  policyStatus: string;
  assignedToId: string | null;
}

// -- Custom dashboards (backend/api/src/modules/dashboards/saved-dashboards.controller.ts) --

export type DashboardVisibility = 'PRIVATE' | 'DEPARTMENT' | 'ORG';

export interface DashboardWidgetSpec {
  id: string;
  title: string;
  reportKey: string;
  filters?: Record<string, unknown>;
  dimension?: string;
}

export interface SavedDashboard {
  id: string;
  name: string;
  ownerId: string | null;
  visibility: DashboardVisibility;
  layoutConfig: unknown;
  widgets: DashboardWidgetSpec[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedDashboardInput {
  name: string;
  visibility: DashboardVisibility;
  widgets: DashboardWidgetSpec[];
  layoutConfig: Record<string, unknown>;
}

export type UpdateSavedDashboardInput = Partial<CreateSavedDashboardInput>;

/** Mirrors backend's RenderedDashboardResponseDto — one entry per widget, `result`/`error` mutually exclusive. */
export interface RenderedDashboardWidget {
  id: string;
  title: string;
  reportKey: string;
  chartType: string;
  result?: unknown;
  error?: string;
}

export interface RenderedDashboard {
  id: string;
  name: string;
  layoutConfig: Record<string, unknown>;
  widgets: RenderedDashboardWidget[];
}
