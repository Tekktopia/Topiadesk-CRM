'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@topiadesk/ui';
import { apiFetch, ApiRequestError, buildQuery } from './api';
import type {
  CreateScheduledReportInput,
  ReportCatalogEntry,
  ReportDownloadResponse,
  ReportExportFormat,
  ReportResult,
  ScheduledReport,
  ScheduledReportRun,
  UpdateScheduledReportInput,
  UserOption,
} from './types';

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.';
}

/** Opens a signed MinIO download URL in a new tab — see report-storage.ts's
 * getReportDownloadUrl() header comment for why this is a short-lived
 * (5 min) signed GET URL rather than a proxied stream. */
function openDownload(result: ReportDownloadResponse): void {
  window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
}

// ---------------------------------------------------------------------------
// Report catalog + run
// ---------------------------------------------------------------------------

export function useReportCatalog() {
  return useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: () => apiFetch<ReportCatalogEntry[]>('/api/reports'),
    staleTime: 5 * 60_000,
  });
}

export interface RunReportInput {
  filters: Record<string, unknown>;
  dimension?: string;
  page?: number;
  pageSize?: number;
}

export function useRunReport(reportKey: string) {
  return useMutation({
    mutationFn: (input: RunReportInput) =>
      apiFetch<ReportResult>(`/api/reports/${reportKey}/run`, { method: 'POST', body: JSON.stringify(input) }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export interface ExportReportInput {
  format: ReportExportFormat;
  filters: Record<string, unknown>;
  dimension?: string;
}

export function useExportReport(reportKey: string) {
  return useMutation({
    mutationFn: (input: ExportReportInput) =>
      apiFetch<ReportDownloadResponse>(
        `/api/reports/${reportKey}/export${buildQuery({
          format: input.format,
          filters: JSON.stringify(input.filters),
          dimension: input.dimension,
        })}`,
      ),
    onSuccess: (result) => {
      openDownload(result);
      toast.success(`Export ready — ${result.rowCount} row${result.rowCount === 1 ? '' : 's'}.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Scheduled reports
// ---------------------------------------------------------------------------

export function useScheduledReports() {
  return useQuery({
    queryKey: ['reports', 'scheduled'],
    queryFn: () => apiFetch<ScheduledReport[]>('/api/scheduled-reports'),
  });
}

export function useCreateScheduledReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduledReportInput) =>
      apiFetch<ScheduledReport>('/api/scheduled-reports', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'scheduled'] });
      toast.success('Scheduled report created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateScheduledReport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateScheduledReportInput) =>
      apiFetch<ScheduledReport>(`/api/scheduled-reports/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'scheduled'] });
      toast.success('Scheduled report updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteScheduledReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/scheduled-reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'scheduled'] });
      toast.success('Scheduled report deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useRunScheduledReportNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ScheduledReportRun>(`/api/scheduled-reports/${id}/run-now`, { method: 'POST' }),
    onSuccess: (_run, id) => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'scheduled', id, 'runs'] });
      toast.success('Run queued — check the history below shortly.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useScheduledReportRuns(id: string | undefined) {
  return useQuery({
    queryKey: ['reports', 'scheduled', id, 'runs'],
    queryFn: () => apiFetch<ScheduledReportRun[]>(`/api/scheduled-reports/${id}/runs`),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'PENDING' || r.status === 'RUNNING') ? 4000 : false),
  });
}

export function useDownloadScheduledReportRun() {
  return useMutation({
    mutationFn: (runId: string) => apiFetch<ReportDownloadResponse>(`/api/scheduled-reports/runs/${runId}/download`),
    onSuccess: (result) => openDownload(result),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Best-effort id -> name/email directory for the recipients picker — see
 * app/api/identity-users/route.ts's header comment for why a 403 (not
 * every role holds `identity:read`) degrades to an empty list rather than
 * an error; a recipient can still be added by raw user id lookup elsewhere
 * being unnecessary here since EMAIL/IN_APP recipients require picking
 * from this list, so an empty directory just means only WEBHOOK recipients
 * are addable for that caller. */
export function useIdentityUsers() {
  return useQuery({
    queryKey: ['reports', 'identity-users'],
    queryFn: () => apiFetch<UserOption[]>('/api/identity-users'),
    staleTime: 5 * 60_000,
  });
}
