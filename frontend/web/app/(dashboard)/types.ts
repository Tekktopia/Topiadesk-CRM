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
