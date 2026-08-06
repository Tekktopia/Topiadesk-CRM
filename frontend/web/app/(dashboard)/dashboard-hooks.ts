'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@topiadesk/ui';
import type { CreateSavedDashboardInput, RenderedDashboard, SalesForecastResponse, SavedDashboard, UpdateSavedDashboardInput } from './types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Every dashboard the caller can see (own PRIVATE + visible DEPARTMENT/ORG ones — saved_dashboards_rw enforces this server-side). */
export function useMyDashboards() {
  return useQuery({
    queryKey: ['saved-dashboards'],
    queryFn: () => fetchJson<SavedDashboard[]>('/api/saved-dashboards'),
    staleTime: 30_000,
  });
}

export function useSalesForecast(period: 'month' | 'quarter', groupBy: 'owner' | 'stage' | 'lineOfBusiness') {
  return useQuery({
    queryKey: ['dashboard', 'sales-forecast', period, groupBy],
    queryFn: () => fetchJson<SalesForecastResponse>(`/api/dashboard/sales-forecast?period=${period}&groupBy=${groupBy}`),
    staleTime: 30_000,
  });
}

export function useRenderSavedDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ['saved-dashboards', id, 'render'],
    queryFn: () => fetchJson<RenderedDashboard>(`/api/saved-dashboards/${id}/render`),
    enabled: Boolean(id),
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
