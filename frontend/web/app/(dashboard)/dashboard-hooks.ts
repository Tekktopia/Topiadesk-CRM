'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@topiadesk/ui';
import type {
  ApprovalDelegation,
  ColleagueOption,
  CreateApprovalDelegationInput,
  CreateSavedDashboardInput,
  DashboardWidgetSpec,
  DealsTrendResponse,
  PendingApproval,
  PipelineFunnelResponse,
  RenewalForecastResponse,
  RenewalRow,
  RenderedDashboard,
  RenderedDashboardWidget,
  SalesForecastResponse,
  SavedDashboard,
  UpdateSavedDashboardInput,
} from './types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Shared shape for optional dashboard-wide scoping — `ownerId`/`lineOfBusiness` narrow KPIs, pipeline, and forecast queries to one owner/line of business when a caller supplies them. */
export interface DashboardScopeFilters {
  ownerId?: string;
  lineOfBusiness?: string;
}

function scopeQueryString(filters?: DashboardScopeFilters): string {
  const qs = new URLSearchParams();
  if (filters?.ownerId) qs.set('ownerId', filters.ownerId);
  if (filters?.lineOfBusiness) qs.set('lineOfBusiness', filters.lineOfBusiness);
  const query = qs.toString();
  return query ? `?${query}` : '';
}

/**
 * Every PENDING Approval visible to the caller — requested by them
 * (tracking) or decidable by them (approval:write ALL scope), same set
 * `approvals_rw`'s RLS policy already scopes server-side. Cross-cutting:
 * spans case closures, policy endorsements/cancellations, knowledge
 * article publishes, role changes, and workflow approval gates.
 */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'PENDING'],
    queryFn: () => fetchJson<PendingApproval[]>('/api/approvals?status=PENDING'),
    staleTime: 30_000,
  });
}

/** Every ApprovalDelegation visible to the caller (given by them, received by them, or — for COMPLIANCE_OFFICER/ADMIN — all, per approval_delegations_rw). */
export function useApprovalDelegations() {
  return useQuery({
    queryKey: ['approval-delegations'],
    queryFn: () => fetchJson<ApprovalDelegation[]>('/api/approvals/delegations'),
    staleTime: 30_000,
  });
}

/** Minimal id+name directory for the "delegate to" picker — see ColleagueOptionDto's own comment for why this isn't the admin user directory. */
export function useDelegationColleagues() {
  return useQuery({
    queryKey: ['approval-delegations', 'colleagues'],
    queryFn: () => fetchJson<ColleagueOption[]>('/api/approvals/delegations/colleagues'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateApprovalDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApprovalDelegationInput) =>
      fetchJson<ApprovalDelegation>('/api/approvals/delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success('Delegation created');
      queryClient.invalidateQueries({ queryKey: ['approval-delegations'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create delegation'),
  });
}

export function useRevokeApprovalDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<{ deleted: boolean }>(`/api/approvals/delegations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Delegation revoked');
      queryClient.invalidateQueries({ queryKey: ['approval-delegations'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to revoke delegation'),
  });
}

/** Every dashboard the caller can see (own PRIVATE + visible DEPARTMENT/ORG ones — saved_dashboards_rw enforces this server-side). */
export function useMyDashboards() {
  return useQuery({
    queryKey: ['saved-dashboards'],
    queryFn: () => fetchJson<SavedDashboard[]>('/api/saved-dashboards'),
    staleTime: 30_000,
  });
}

export function useSalesForecast(period: 'month' | 'quarter', groupBy: 'owner' | 'stage' | 'lineOfBusiness', filters?: DashboardScopeFilters) {
  return useQuery({
    queryKey: ['dashboard', 'sales-forecast', period, groupBy, filters],
    queryFn: () => {
      const qs = new URLSearchParams({ period, groupBy });
      if (filters?.ownerId) qs.set('ownerId', filters.ownerId);
      if (filters?.lineOfBusiness) qs.set('lineOfBusiness', filters.lineOfBusiness);
      return fetchJson<SalesForecastResponse>(`/api/dashboard/sales-forecast?${qs.toString()}`);
    },
    staleTime: 30_000,
  });
}

/** Renewal counterpart to useSalesForecast above — weighted by RENEWAL_STATUS_WEIGHTS (dashboards.controller.ts) instead of a stored probability field. */
export function useRenewalForecast(period: 'month' | 'quarter', groupBy: 'status' | 'owner' | 'lineOfBusiness', filters?: DashboardScopeFilters) {
  return useQuery({
    queryKey: ['dashboard', 'renewal-forecast', period, groupBy, filters],
    queryFn: () => {
      const qs = new URLSearchParams({ period, groupBy });
      if (filters?.ownerId) qs.set('ownerId', filters.ownerId);
      if (filters?.lineOfBusiness) qs.set('lineOfBusiness', filters.lineOfBusiness);
      return fetchJson<RenewalForecastResponse>(`/api/dashboard/renewal-forecast?${qs.toString()}`);
    },
    staleTime: 30_000,
  });
}

interface DepartmentPipelineBreakdown {
  departmentId: string;
  departmentName: string;
  openOpportunityCount: number;
  pipelineValue: string;
  wonThisMonthCount: number;
  wonThisMonthValue: string;
}
interface LossReasonBreakdown {
  reason: string;
  count: number;
}
export interface OperationalKpis {
  openOpportunities: number;
  pipelineValue: string;
  renewalsDueNext90Days: number;
  activeClients: number;
  wonThisMonthCount: number;
  wonThisMonthValue: string;
  winRate: number | null;
  byDepartment: DepartmentPipelineBreakdown[];
  lossReasonBreakdown: LossReasonBreakdown[];
}

export function useOperationalKpis(filters?: DashboardScopeFilters) {
  return useQuery({
    queryKey: ['dashboard', 'kpis', filters],
    queryFn: () => fetchJson<OperationalKpis>(`/api/dashboard/kpis${scopeQueryString(filters)}`),
  });
}

export function usePipelineFunnel(filters?: DashboardScopeFilters) {
  return useQuery({
    queryKey: ['dashboard', 'pipeline-funnel', filters],
    queryFn: () => fetchJson<PipelineFunnelResponse>(`/api/dashboard/pipeline-funnel${scopeQueryString(filters)}`),
  });
}

export interface RenewalScopeFilters {
  ownerId?: string;
  from?: string;
  to?: string;
}
export function useRenewals(filters?: RenewalScopeFilters) {
  return useQuery({
    queryKey: ['dashboard', 'renewals', filters],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filters?.ownerId) qs.set('ownerId', filters.ownerId);
      if (filters?.from) qs.set('from', filters.from);
      if (filters?.to) qs.set('to', filters.to);
      const query = qs.toString();
      return fetchJson<RenewalRow[]>(`/api/dashboard/renewals${query ? `?${query}` : ''}`);
    },
  });
}

/** Trailing 12mo won deals + forward 12mo open-deal projection, both by month — not filter-scoped (a 12-month trend read alongside a single-owner/LOB slice would be too sparse to read as a trend line). */
export function useDealsTrend() {
  return useQuery({
    queryKey: ['dashboard', 'deals-trend'],
    queryFn: () => fetchJson<DealsTrendResponse>('/api/dashboard/deals-trend'),
    staleTime: 60_000,
  });
}

export function useRenderSavedDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ['saved-dashboards', id, 'render'],
    queryFn: () => fetchJson<RenderedDashboard>(`/api/saved-dashboards/${id}/render`),
    enabled: Boolean(id),
  });
}

/**
 * Live preview for the Customize-mode editor — renders a draft widget set
 * that hasn't been (and may never be) saved yet, via the stateless
 * POST /saved-dashboards/render-preview route (SavedDashboardsController.
 * renderPreview). A mutation rather than a query since the "input" is
 * arbitrary draft state the caller triggers explicitly (on entering edit
 * mode, and again after every add/remove), not a cache key to key a query
 * off of.
 */
export function useRenderPreview() {
  return useMutation({
    mutationFn: (widgets: DashboardWidgetSpec[]) =>
      fetchJson<RenderedDashboardWidget[]>('/api/saved-dashboards/render-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets }),
      }),
  });
}

export function useCreateSavedDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedDashboardInput) =>
      fetchJson<SavedDashboard>('/api/saved-dashboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Dashboard created');
      queryClient.invalidateQueries({ queryKey: ['saved-dashboards'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create dashboard'),
  });
}

export function useUpdateSavedDashboard(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSavedDashboardInput) =>
      fetchJson<SavedDashboard>(`/api/saved-dashboards/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Dashboard saved');
      queryClient.invalidateQueries({ queryKey: ['saved-dashboards'] });
      queryClient.invalidateQueries({ queryKey: ['saved-dashboards', id, 'render'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save dashboard'),
  });
}

export function useDeleteSavedDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<{ deleted: boolean }>(`/api/saved-dashboards/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Dashboard reset to default');
      queryClient.invalidateQueries({ queryKey: ['saved-dashboards'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to reset dashboard'),
  });
}
