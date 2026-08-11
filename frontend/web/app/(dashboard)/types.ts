import type { ReportChartType } from '../(reports)/_lib/types';

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

// -- Sales forecast (backend/api/src/modules/dashboards/dashboards.controller.ts's getSalesForecast) --

export interface SalesForecastGroup {
  key: string;
  label: string | null;
  count: number;
  weightedAmount: string;
  unweightedAmount: string;
}

export interface SalesForecastResponse {
  period: string;
  periodStart: string;
  periodEnd: string;
  groups: SalesForecastGroup[];
  totalWeightedAmount: string;
  totalUnweightedAmount: string;
}

// -- Renewal forecast (backend/api/src/modules/dashboards/dashboards.controller.ts's getRenewalForecast) --

export interface RenewalForecastGroup {
  key: string;
  label: string | null;
  count: number;
  weightedAmount: string;
  unweightedAmount: string;
}

export interface RenewalForecastResponse {
  period: string;
  periodStart: string;
  periodEnd: string;
  groups: RenewalForecastGroup[];
  totalWeightedAmount: string;
  totalUnweightedAmount: string;
  atRiskAmount: string;
}

// -- Deals trend (backend/api/src/modules/dashboards/dashboards.controller.ts's getDealsTrend) --

export interface DealsTrendMonth {
  month: string;
  wonCount: number;
  wonAmount: string;
}

export interface DealsProjectionMonth {
  month: string;
  count: number;
  weightedAmount: string;
  unweightedAmount: string;
}

export interface DealsTrendResponse {
  trailing: DealsTrendMonth[];
  forward: DealsProjectionMonth[];
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
  /** Overrides the report's own `defaultChartType` for this widget — see AddWidgetDialog's Visualization picker. Omitted means "use the report's default." */
  chartType?: ReportChartType;
}

/** Mirrors @topiadesk/ui's DashboardGrid `GridLayoutItem` — kept as a separate local type (rather than importing from @topiadesk/ui here) since this is the persisted-JSON shape (SavedDashboard.layoutConfig.items), not a component prop. */
export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
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

/** Mirrors backend's PendingApprovalDto — see approvals.controller.ts. */
export interface PendingApproval {
  id: string;
  entityType: string;
  status: string;
  reason: string | null;
  requestedById: string;
  requestedByName: string | null;
  createdAt: string;
  label: string;
  linkPath: string | null;
  isMine: boolean;
}

/** Mirrors backend's ApprovalDelegationResponseDto — see approval-delegations.controller.ts. */
export interface ApprovalDelegation {
  id: string;
  delegatorId: string;
  delegatorName: string | null;
  delegateId: string;
  delegateName: string | null;
  startsAt: string;
  endsAt: string;
  note: string | null;
  createdAt: string;
  isActive: boolean;
  isMine: boolean;
  standsInFor: string;
}

export interface CreateApprovalDelegationInput {
  delegateId: string;
  startsAt: string;
  endsAt: string;
  note?: string;
}

/** Mirrors backend's ColleagueOptionDto — see approval-delegations.controller.ts. */
export interface ColleagueOption {
  id: string;
  fullName: string;
}
