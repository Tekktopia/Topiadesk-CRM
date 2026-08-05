'use client';

import { useMutation, useQueries, useQuery, useQueryClient, type Query } from '@tanstack/react-query';
import { toast } from '@topiadesk/ui';
import { apiFetch, ApiRequestError, buildQuery } from './api';
import type {
  AbTestDecideWinnerResponse,
  AudienceSegment,
  Campaign,
  CampaignPerformance,
  CampaignQuery,
  CampaignRecipient,
  CampaignSuppression,
  CampaignTemplate,
  CreateAudienceSegmentInput,
  CreateCampaignInput,
  CreateCampaignTemplateInput,
  MergeFieldDescriptor,
  SegmentFilterGroup,
  SegmentPreviewResponse,
  UpdateAudienceSegmentInput,
  UpdateCampaignInput,
  UpdateCampaignTemplateInput,
} from './types';

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.';
}

/** Campaigns in one of these statuses have status/counts that can still change server-side (worker dispatch + provider webhooks) — polled every 5s on the detail page while true, refetch-on-focus only otherwise. */
const LIVE_STATUSES = new Set(['SCHEDULED', 'SENDING']);

function liveRefetchInterval(status: Campaign['status'] | undefined): number | false {
  return status && LIVE_STATUSES.has(status) ? 5000 : false;
}

// ---------------------------------------------------------------------------
// Audience segments
// ---------------------------------------------------------------------------

export function useAudienceSegments() {
  return useQuery({
    queryKey: ['campaigns', 'audience-segments'],
    queryFn: () => apiFetch<AudienceSegment[]>('/api/audience-segments'),
  });
}

export function useAudienceSegment(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'audience-segments', id],
    queryFn: () => apiFetch<AudienceSegment>(`/api/audience-segments/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateAudienceSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAudienceSegmentInput) =>
      apiFetch<AudienceSegment>('/api/audience-segments', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (segment) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'audience-segments'] });
      toast.success(`Audience segment "${segment.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateAudienceSegment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAudienceSegmentInput) =>
      apiFetch<AudienceSegment>(`/api/audience-segments/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'audience-segments'] });
      toast.success('Audience segment updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteAudienceSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/audience-segments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'audience-segments'] });
      toast.success('Audience segment deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** POST /audience-segments/:id/preview — only callable against an already-created segment (the endpoint 404s on an unknown id), so "preview before first save" isn't possible; `filters` overrides the saved ones for a live, unsaved-edits preview. */
export function usePreviewAudienceSegment(id: string) {
  return useMutation({
    mutationFn: (filters?: SegmentFilterGroup) =>
      apiFetch<SegmentPreviewResponse>(`/api/audience-segments/${id}/preview`, {
        method: 'POST',
        body: JSON.stringify(filters ? { filters } : {}),
      }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Campaign templates
// ---------------------------------------------------------------------------

export function useCampaignTemplates() {
  return useQuery({
    queryKey: ['campaigns', 'templates'],
    queryFn: () => apiFetch<CampaignTemplate[]>('/api/campaign-templates'),
  });
}

export function useCampaignTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'templates', id],
    queryFn: () => apiFetch<CampaignTemplate>(`/api/campaign-templates/${id}`),
    enabled: Boolean(id),
  });
}

/** GET /campaign-templates/merge-fields — fixed allowlist, safe to treat as effectively static. */
export function useMergeFields() {
  return useQuery({
    queryKey: ['campaigns', 'merge-fields'],
    queryFn: () => apiFetch<MergeFieldDescriptor[]>('/api/campaign-templates/merge-fields'),
    staleTime: 10 * 60_000,
  });
}

export function useCreateCampaignTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignTemplateInput) =>
      apiFetch<CampaignTemplate>('/api/campaign-templates', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'templates'] });
      toast.success(`Template "${template.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateCampaignTemplate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCampaignTemplateInput) =>
      apiFetch<CampaignTemplate>(`/api/campaign-templates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'templates'] });
      toast.success('Template updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteCampaignTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/campaign-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'templates'] });
      toast.success('Template deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function useCampaigns(query: CampaignQuery = {}) {
  return useQuery({
    queryKey: ['campaigns', 'list', query],
    queryFn: () => apiFetch<Campaign[]>(`/api/campaigns${buildQuery(query)}`),
    // The list is the at-a-glance view of everything in flight — refetch on
    // focus rather than a background poll (per-row detail polling below is
    // where "live" actually matters).
    refetchOnWindowFocus: true,
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'detail', id],
    queryFn: () => apiFetch<Campaign>(`/api/campaigns/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query: Query<Campaign>) => liveRefetchInterval(query.state.data?.status),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      apiFetch<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'list'] });
      toast.success(`Campaign "${campaign.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateCampaign(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCampaignInput) =>
      apiFetch<Campaign>(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'detail', id] });
      toast.success('Campaign updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

function useCampaignAction(id: string, action: 'send' | 'schedule' | 'pause' | 'resume' | 'cancel', successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { scheduledSendAt: string }) =>
      apiFetch<Campaign>(`/api/campaigns/${id}/${action}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'detail', id] });
      toast.success(successMessage);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useSendCampaignNow(id: string) {
  return useCampaignAction(id, 'send', 'Campaign is sending');
}

export function useScheduleCampaign(id: string) {
  return useCampaignAction(id, 'schedule', 'Campaign scheduled');
}

export function usePauseCampaign(id: string) {
  return useCampaignAction(id, 'pause', 'Campaign paused');
}

export function useResumeCampaign(id: string) {
  return useCampaignAction(id, 'resume', 'Campaign resumed');
}

export function useCancelCampaign(id: string) {
  return useCampaignAction(id, 'cancel', 'Campaign cancelled');
}

export function useDecideAbTestWinner(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<AbTestDecideWinnerResponse>(`/api/campaigns/${id}/ab-test/decide-winner`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'detail', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'performance', id] });
      toast.success('A/B test winner decided — remaining recipients queued');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useCampaignRecipients(id: string | undefined, liveStatus: Campaign['status'] | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'recipients', id],
    queryFn: () => apiFetch<CampaignRecipient[]>(`/api/campaigns/${id}/recipients`),
    enabled: Boolean(id),
    refetchInterval: () => liveRefetchInterval(liveStatus),
  });
}

export function useCampaignPerformance(id: string | undefined, liveStatus: Campaign['status'] | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'performance', id],
    queryFn: () => apiFetch<CampaignPerformance>(`/api/campaigns/${id}/performance`),
    enabled: Boolean(id),
    refetchInterval: () => liveRefetchInterval(liveStatus),
  });
}

/**
 * GET /campaigns (list) doesn't include a recipient count — only `variants`
 * (see CampaignsController.list()) — and there's no bulk/aggregate endpoint
 * for it. N+1-fetches each listed campaign's performance() for its
 * `totalRecipients`, same "cheap enough at seeded-demo scale, no dedicated
 * backend endpoint to lean on instead" reasoning as
 * app/(crm)/_lib/hooks.ts's useAllPipelineStages. Shares its query key with
 * useCampaignPerformance, so opening a campaign's detail page after viewing
 * the list is a cache hit, not a second request.
 */
export function useCampaignRecipientCounts(campaignIds: string[]) {
  const queries = useQueries({
    queries: campaignIds.map((id) => ({
      queryKey: ['campaigns', 'performance', id],
      queryFn: () => apiFetch<CampaignPerformance>(`/api/campaigns/${id}/performance`),
      staleTime: 30_000,
    })),
  });
  const countsById = new Map<string, number>();
  campaignIds.forEach((id, i) => {
    const data = queries[i]?.data;
    if (data) countsById.set(id, data.totalRecipients);
  });
  return { countsById, isLoading: queries.some((q) => q.isLoading) };
}

// ---------------------------------------------------------------------------
// Suppressions
// ---------------------------------------------------------------------------

/**
 * `retry: false` + `throwOnError: false` because backend/api exposes no
 * authenticated CampaignSuppression list endpoint today (see the
 * suppressions page's header comment) — the proxy 404s and the page renders
 * an explicit "not exposed yet" state instead of retry-spinning, same
 * degrade-gracefully approach as app/(crm)/_lib/hooks.ts's
 * useDirectoryUsers.
 */
export function useCampaignSuppressions() {
  return useQuery({
    queryKey: ['campaigns', 'suppressions'],
    queryFn: () => apiFetch<CampaignSuppression[]>('/api/campaign-suppressions'),
    retry: false,
    throwOnError: false,
  });
}
