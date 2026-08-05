'use client';

import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@topiadesk/ui';
import { apiFetch, ApiRequestError, buildQuery } from './api';
import type {
  AgentSkill,
  ApplyMacroResponse,
  AssignmentRule,
  AssignmentTestResponse,
  BusinessHoliday,
  BusinessHoursCalendar,
  Case,
  CaseCategory,
  CaseClosureApproval,
  CaseComment,
  CaseQuery,
  CaseQueueQuery,
  CaseWatcher,
  ChangeCaseStatusInput,
  ChangeClaimStatusInput,
  Claim,
  ClaimQuery,
  ClaimStatusHistoryEntry,
  CreateAgentSkillInput,
  CreateAssignmentRuleInput,
  CreateBusinessHolidayInput,
  CreateBusinessHoursCalendarInput,
  CreateCaseCategoryInput,
  CreateCaseInput,
  CreateClaimInput,
  CreateCommentInput,
  CreateLossCauseCategoryInput,
  CreateMacroInput,
  CreateSlaPolicyInput,
  CreateSlaTargetInput,
  DecideCaseClosureInput,
  LinkChildCaseInput,
  LookupOption,
  LossCauseCategory,
  Macro,
  MacroPreviewResponse,
  MergeCaseInput,
  ReopenClaimInput,
  RequestCaseClosureInput,
  ResolvedPermission,
  SlaClock,
  SlaPolicy,
  SlaTarget,
  TeamOption,
  UpdateAgentSkillInput,
  UpdateAssignmentRuleInput,
  UpdateBusinessHolidayInput,
  UpdateBusinessHoursCalendarInput,
  UpdateCaseCategoryInput,
  UpdateCaseInput,
  UpdateClaimInput,
  UpdateLossCauseCategoryInput,
  UpdateMacroInput,
  UpdateSlaPolicyInput,
  UpdateSlaTargetInput,
  UserOption,
} from './types';

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.';
}

type EntityKind = 'claims' | 'cases';

/**
 * No bulk/* endpoint exists on cases.controller.ts/claims.controller.ts
 * (unlike accounts/leads/opportunities.controller.ts's bulk/assign +
 * bulk/delete) and neither entity is deletable at all — so a "bulk" action
 * here fans out one request per selected row via Promise.allSettled and
 * tallies successes/failures for the caller to toast, instead of a single
 * round-trip. Backend is out of scope for this batch (see this batch's own
 * brief), so this fan-out is the pragmatic frontend-only equivalent.
 */
async function settleAndReport(ids: string[], run: (id: string) => Promise<unknown>): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(ids.map(run));
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  return { succeeded, failed: results.length - succeeded };
}

function reportBulkResult(entityLabel: string, verb: string, { succeeded, failed }: { succeeded: number; failed: number }): void {
  if (failed === 0) {
    toast.success(`${verb} ${succeeded} ${entityLabel}${succeeded === 1 ? '' : 's'}`);
  } else if (succeeded === 0) {
    toast.error(`Couldn't ${verb.toLowerCase()} any of the ${failed} selected ${entityLabel}${failed === 1 ? '' : 's'} — check they allow this change.`);
  } else {
    toast.error(`${verb} ${succeeded} ${entityLabel}${succeeded === 1 ? '' : 's'}, ${failed} failed — check they allow this change.`);
  }
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export function useClaims(query: ClaimQuery = {}) {
  return useQuery({
    queryKey: ['claims', query],
    queryFn: () => apiFetch<Claim[]>(`/api/claims${buildQuery(query)}`),
  });
}

export function useClaim(id: string | undefined) {
  return useQuery({
    queryKey: ['claims', id],
    queryFn: () => apiFetch<Claim>(`/api/claims/${id}`),
    enabled: Boolean(id),
  });
}

export function useClaimStatusHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['claims', id, 'status-history'],
    queryFn: () => apiFetch<ClaimStatusHistoryEntry[]>(`/api/claims/${id}/status-history`),
    enabled: Boolean(id),
  });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClaimInput) => apiFetch<Claim>('/api/claims', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (claim) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      toast.success(`Claim "${claim.claimNumber}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateClaim(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClaimInput) => apiFetch<Claim>(`/api/claims/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      toast.success('Claim updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useChangeClaimStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeClaimStatusInput) =>
      apiFetch<Claim>(`/api/claims/${id}/status`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (claim) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['claims', id, 'status-history'] });
      toast.success(`Claim marked ${claim.status}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useReopenClaim(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReopenClaimInput) => apiFetch<Claim>(`/api/claims/${id}/reopen`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['claims', id, 'status-history'] });
      toast.success('Claim reopened');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Fans out one PATCH /claims/:id per selected row (see settleAndReport's header comment — no bulk/* endpoint exists). */
export function useBulkReassignClaims() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, adjusterId }: { ids: string[]; adjusterId: string }) =>
      settleAndReport(ids, (id) => apiFetch<Claim>(`/api/claims/${id}`, { method: 'PATCH', body: JSON.stringify({ adjusterId }) })),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      reportBulkResult('claim', 'Reassigned', result);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/**
 * "Bulk close" for claims: WITHDRAWN is the closest terminal, no-payout
 * status CLAIM_STATUS_TRANSITIONS actually allows from most active states
 * (NOTIFIED/UNDER_REVIEW/ADJUSTED) — SETTLED/REPUDIATED both require
 * amount/reason context a bulk action can't safely supply per-row, so this
 * is deliberately "withdraw", not a generic "close". Rows already in a
 * terminal status (SETTLED/REPUDIATED/WITHDRAWN itself) fail server-side
 * (invalid transition) and are reported, not silently skipped.
 */
export function useBulkWithdrawClaims() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      settleAndReport(ids, (id) => apiFetch<Claim>(`/api/claims/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'WITHDRAWN' }) })),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      reportBulkResult('claim', 'Withdrew', result);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export function useCases(query: CaseQuery = {}) {
  return useQuery({
    queryKey: ['cases', query],
    queryFn: () => apiFetch<Case[]>(`/api/cases${buildQuery(query)}`),
  });
}

export function useCasesQueue(query: CaseQueueQuery = {}) {
  return useQuery({
    queryKey: ['cases', 'queue', query],
    queryFn: () => apiFetch<Case[]>(`/api/cases/queue${buildQuery(query)}`),
  });
}

export function useCase(id: string | undefined) {
  return useQuery({
    queryKey: ['cases', id],
    queryFn: () => apiFetch<Case>(`/api/cases/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCaseInput) => apiFetch<Case>('/api/cases', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (kase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success(`Ticket "${kase.caseNumber}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateCase(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCaseInput) => apiFetch<Case>(`/api/cases/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Ticket updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Self-assign from the unassigned queue (POST /cases/:id/claim) — deliberately not named useClaimCase to avoid reading as "Claim the claims entity". */
export function useSelfAssignCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Case>(`/api/cases/${id}/claim`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Ticket assigned to you');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useChangeCaseStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeCaseStatusInput) => apiFetch<Case>(`/api/cases/${id}/status`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (kase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success(`Ticket marked ${kase.status}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Non-COMPLAINT cases close immediately (returns the closed Case); COMPLAINT cases create a pending closure approval instead (the Case itself is unchanged — see useCaseClosureApproval). */
export function useRequestCaseClosure(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestCaseClosureInput = {}) => apiFetch<Case>(`/api/cases/${id}/request-closure`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (kase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases', id, 'closure-approval'] });
      toast.success(kase.status === 'CLOSED' ? 'Ticket closed' : 'Closure approval requested');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useCaseClosureApproval(id: string) {
  return useQuery({
    queryKey: ['cases', id, 'closure-approval'],
    queryFn: () => apiFetch<CaseClosureApproval | null>(`/api/cases/${id}/closure-approval`),
    enabled: Boolean(id),
  });
}

export function useDecideCaseClosure(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideCaseClosureInput) => apiFetch<Case>(`/api/cases/${id}/closure-decision`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (_kase, input) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases', id, 'closure-approval'] });
      toast.success(input.decision === 'APPROVED' ? 'Closure approved — ticket closed' : 'Closure rejected');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Fans out one PATCH /cases/:id per selected row (see settleAndReport's header comment — no bulk/* endpoint exists). */
export function useBulkReassignCases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, assignedToId }: { ids: string[]; assignedToId: string }) =>
      settleAndReport(ids, (id) => apiFetch<Case>(`/api/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ assignedToId }) })),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      reportBulkResult('ticket','Reassigned', result);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Bulk close: CASE_STATUS_TRANSITIONS allows CLOSED from NEW/OPEN/PENDING_CUSTOMER/PENDING_CARRIER/RESOLVED — rows already CLOSED/REOPENED fail server-side (invalid transition) and are reported, not silently skipped. */
export function useBulkCloseCases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      settleAndReport(ids, (id) => apiFetch<Case>(`/api/cases/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'CLOSED' }) })),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      reportBulkResult('ticket','Closed', result);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useLinkChildCase(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkChildCaseInput) => apiFetch<Case>(`/api/cases/${id}/link-child`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Ticket linked as a child');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useMergeCase(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MergeCaseInput) => apiFetch<Case>(`/api/cases/${id}/merge`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Ticket merged');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function usePreviewMacroOnCase(caseId: string) {
  return useMutation({
    mutationFn: (macroId: string) =>
      apiFetch<MacroPreviewResponse>(`/api/macros/${macroId}/preview`, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'CASE', entityId: caseId }),
      }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useApplyMacroToCase(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (macroId: string) => apiFetch<ApplyMacroResponse>(`/api/cases/${caseId}/apply-macro/${macroId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases', caseId, 'comments'] });
      toast.success('Macro applied');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function usePreviewMacroOnClaim(claimId: string) {
  return useMutation({
    mutationFn: (macroId: string) =>
      apiFetch<MacroPreviewResponse>(`/api/macros/${macroId}/preview`, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'CLAIM', entityId: claimId }),
      }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useApplyMacroToClaim(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (macroId: string) => apiFetch<ApplyMacroResponse>(`/api/claims/${claimId}/apply-macro/${macroId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims', claimId] });
      queryClient.invalidateQueries({ queryKey: ['claims', claimId, 'comments'] });
      toast.success('Macro applied');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Comments (Activity rows scoped by claimId/caseId) — shared across Claim/Case detail
// ---------------------------------------------------------------------------

export function useComments(entity: EntityKind, id: string | undefined) {
  return useQuery({
    queryKey: [entity, id, 'comments'],
    queryFn: () => apiFetch<CaseComment[]>(`/api/${entity}/${id}/comments`),
    enabled: Boolean(id),
  });
}

export function useAddComment(entity: EntityKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      apiFetch<CaseComment>(`/api/${entity}/${id}/comments`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity, id, 'comments'] });
      toast.success('Comment added');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Watchers — shared across Claim/Case detail
// ---------------------------------------------------------------------------

export function useWatchers(entity: EntityKind, id: string | undefined) {
  return useQuery({
    queryKey: [entity, id, 'watchers'],
    queryFn: () => apiFetch<CaseWatcher[]>(`/api/${entity}/${id}/watchers`),
    enabled: Boolean(id),
  });
}

export function useAddWatcher(entity: EntityKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<CaseWatcher>(`/api/${entity}/${id}/watchers`, { method: 'POST', body: JSON.stringify({ userId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity, id, 'watchers'] });
      toast.success('Watcher added');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useRemoveWatcher(entity: EntityKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiFetch<{ deleted: boolean }>(`/api/${entity}/${id}/watchers/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity, id, 'watchers'] });
      toast.success('Watcher removed');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// SLA policies + targets
// ---------------------------------------------------------------------------

export function useSlaPolicies(entityType?: 'CLAIM' | 'CASE') {
  return useQuery({
    queryKey: ['sla-policies', entityType ?? null],
    queryFn: () => apiFetch<SlaPolicy[]>(`/api/sla-policies${buildQuery({ entityType })}`),
  });
}

/**
 * `retry: false`/`throwOnError: false`: the SLA policy detail is now also
 * fetched from Case/Claim detail views (see useCaseSlaClocks/
 * useClaimSlaClocks below) to resolve a clock's metricType label — those
 * callers may be ACCOUNT_HANDLER/MANAGER, which hold no 'sla_config'
 * permission grant at any scope (see seed.ts) and get a guaranteed 403.
 * Same degrade-gracefully convention as useDirectoryUsers above, so a
 * broker viewing their own case doesn't see 3x retried failed requests.
 */
export function useSlaPolicy(id: string | undefined) {
  return useQuery({
    queryKey: ['sla-policies', id],
    queryFn: () => apiFetch<SlaPolicy>(`/api/sla-policies/${id}`),
    enabled: Boolean(id),
    retry: false,
    throwOnError: false,
  });
}

// ---------------------------------------------------------------------------
// SLA clocks — read-only, joined client-side from GET /sla-policies/:id/
// clocks (see types.ts's SlaClock doc comment for why: SlaClock rows aren't
// embedded on CaseResponseDto/ClaimResponseDto, and the only read path is
// scoped by POLICY id, not case/claim id). Degrades to empty data — never
// throws — for a caller without 'sla_config':'read'.
// ---------------------------------------------------------------------------

/** One request per distinct policy id (cheap: a handful of policies exist at seeded scale), joined into a caseId/claimId -> clocks[] map for list-view badges. */
export function useSlaClocksByPolicyIds(policyIds: Array<string | null | undefined>) {
  const uniqueIds = Array.from(new Set(policyIds.filter((id): id is string => Boolean(id))));
  const queries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['sla-policies', id, 'clocks'],
      queryFn: () => apiFetch<SlaClock[]>(`/api/sla-policies/${id}/clocks`),
      retry: false,
      staleTime: 30_000,
      throwOnError: false,
    })),
  });

  const clocksByEntityId = new Map<string, SlaClock[]>();
  for (const q of queries) {
    for (const clock of q.data ?? []) {
      const key = clock.caseId ?? clock.claimId;
      if (!key) continue;
      const existing = clocksByEntityId.get(key);
      if (existing) existing.push(clock);
      else clocksByEntityId.set(key, [clock]);
    }
  }
  return { clocksByEntityId, isLoading: queries.some((q) => q.isLoading), isError: uniqueIds.length > 0 && queries.every((q) => q.isError) };
}

/** Case's two-clock model (see sla-clock.util.ts's startCaseClocks) — splits this case's clocks into its FIRST_RESPONSE and RESOLUTION targets by joining against the resolved SlaPolicy's targets (for the metricType each SlaClock row itself doesn't carry). */
export function useCaseSlaClocks(kase: Pick<Case, 'id' | 'slaPolicyId'> | undefined) {
  const policyId = kase?.slaPolicyId ?? undefined;
  const policyQuery = useSlaPolicy(policyId);
  const { clocksByEntityId, isLoading: clocksLoading } = useSlaClocksByPolicyIds([policyId]);
  const clocks = kase ? (clocksByEntityId.get(kase.id) ?? []) : [];
  const targetsById = new Map((policyQuery.data?.targets ?? []).map((t) => [t.id, t]));

  return {
    clocks,
    firstResponse: clocks.find((c) => targetsById.get(c.slaTargetId)?.metricType === 'FIRST_RESPONSE') ?? null,
    resolution: clocks.find((c) => targetsById.get(c.slaTargetId)?.metricType === 'RESOLUTION') ?? null,
    isLoading: Boolean(policyId) && (policyQuery.isLoading || clocksLoading),
    hasAccess: !policyQuery.isError,
  };
}

/** Claim's per-stage model (see sla-clock.util.ts's startClaimStageClock/advanceClaimStageClocks) — at most one clock is RUNNING/PAUSED at a time (the current stage); falls back to the most recently started clock so a SATISFIED/BREACHED terminal claim still shows its last stage's outcome. */
export function useClaimSlaClocks(claim: Pick<Claim, 'id' | 'slaPolicyId'> | undefined) {
  const policyId = claim?.slaPolicyId ?? undefined;
  const policyQuery = useSlaPolicy(policyId);
  const { clocksByEntityId, isLoading: clocksLoading } = useSlaClocksByPolicyIds([policyId]);
  const clocks = claim ? (clocksByEntityId.get(claim.id) ?? []) : [];
  const targetsById = new Map((policyQuery.data?.targets ?? []).map((t) => [t.id, t]));

  const currentStage =
    clocks.find((c) => c.status === 'RUNNING' || c.status === 'PAUSED') ??
    clocks.slice().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] ??
    null;

  return {
    clocks,
    currentStage,
    currentStageFromStatus: currentStage ? (targetsById.get(currentStage.slaTargetId)?.fromStatus ?? null) : null,
    isLoading: Boolean(policyId) && (policyQuery.isLoading || clocksLoading),
    hasAccess: !policyQuery.isError,
  };
}

export function useCreateSlaPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSlaPolicyInput) => apiFetch<SlaPolicy>('/api/sla-policies', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      toast.success('SLA policy created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateSlaPolicy(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSlaPolicyInput) => apiFetch<SlaPolicy>(`/api/sla-policies/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      toast.success('SLA policy updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteSlaPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/sla-policies/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      toast.success('SLA policy deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useAddSlaTarget(policyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSlaTargetInput) =>
      apiFetch<SlaTarget>(`/api/sla-policies/${policyId}/targets`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies', policyId] });
      toast.success('SLA target added');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateSlaTarget(policyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId, input }: { targetId: string; input: UpdateSlaTargetInput }) =>
      apiFetch<SlaTarget>(`/api/sla-policies/${policyId}/targets/${targetId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies', policyId] });
      toast.success('SLA target updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteSlaTarget(policyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/sla-policies/${policyId}/targets/${targetId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies', policyId] });
      toast.success('SLA target removed');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

export function useMacros() {
  return useQuery({
    queryKey: ['macros'],
    queryFn: () => apiFetch<Macro[]>('/api/macros'),
  });
}

export function useMacro(id: string | undefined) {
  return useQuery({
    queryKey: ['macros', id],
    queryFn: () => apiFetch<Macro>(`/api/macros/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMacro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMacroInput) => apiFetch<Macro>('/api/macros', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (macro) => {
      queryClient.invalidateQueries({ queryKey: ['macros'] });
      toast.success(`Macro "${macro.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateMacro(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMacroInput) => apiFetch<Macro>(`/api/macros/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] });
      toast.success('Macro updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteMacro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/macros/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] });
      toast.success('Macro deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Assignment rules
// ---------------------------------------------------------------------------

export function useAssignmentRules() {
  return useQuery({
    queryKey: ['assignment-rules'],
    queryFn: () => apiFetch<AssignmentRule[]>('/api/assignment-rules'),
  });
}

export function useCreateAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssignmentRuleInput) =>
      apiFetch<AssignmentRule>('/api/assignment-rules', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (rule) => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success(`Assignment rule "${rule.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateAssignmentRule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAssignmentRuleInput) =>
      apiFetch<AssignmentRule>(`/api/assignment-rules/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success('Assignment rule updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/assignment-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast.success('Assignment rule deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Dry-run "who would this rule assign right now" — POST /assignment-rules/:id/test, doesn't persist the round-robin cursor. */
export function useTestAssignmentRule() {
  return useMutation({
    mutationFn: (id: string) => apiFetch<AssignmentTestResponse>(`/api/assignment-rules/${id}/test`, { method: 'POST' }),
    onSuccess: (result) => {
      toast.info(result.reasoning);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Case categories — full CRUD (app/(cases)/case-categories/**), also reused
// read-only as a lookup feeding the categoryId select on the "New ticket"
// dialog.
// ---------------------------------------------------------------------------

export function useCaseCategories() {
  return useQuery({
    queryKey: ['case-categories'],
    queryFn: () => apiFetch<CaseCategory[]>('/api/case-categories'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCaseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCaseCategoryInput) => apiFetch<CaseCategory>('/api/case-categories', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ['case-categories'] });
      toast.success(`Ticket category "${category.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateCaseCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCaseCategoryInput) => apiFetch<CaseCategory>(`/api/case-categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-categories'] });
      toast.success('Ticket category updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteCaseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/case-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-categories'] });
      toast.success('Ticket category deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Loss cause categories — full CRUD (app/(cases)/loss-cause-categories/**),
// also reused read-only feeding the causeOfLossCategoryId select on the
// "New claim" dialog.
// ---------------------------------------------------------------------------

export function useLossCauseCategories() {
  return useQuery({
    queryKey: ['loss-cause-categories'],
    queryFn: () => apiFetch<LossCauseCategory[]>('/api/loss-cause-categories'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateLossCauseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLossCauseCategoryInput) =>
      apiFetch<LossCauseCategory>('/api/loss-cause-categories', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ['loss-cause-categories'] });
      toast.success(`Loss cause category "${category.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateLossCauseCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLossCauseCategoryInput) =>
      apiFetch<LossCauseCategory>(`/api/loss-cause-categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loss-cause-categories'] });
      toast.success('Loss cause category updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteLossCauseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/loss-cause-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loss-cause-categories'] });
      toast.success('Loss cause category deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Business hours calendars + holidays — full CRUD
// (app/(cases)/business-hours/**), also reused read-only feeding the
// businessHoursCalendarId select on the SLA policy form.
// ---------------------------------------------------------------------------

export function useBusinessHoursCalendars() {
  return useQuery({
    queryKey: ['business-hours-calendars'],
    queryFn: () => apiFetch<BusinessHoursCalendar[]>('/api/business-hours'),
    staleTime: 5 * 60_000,
  });
}

export function useBusinessHoursCalendar(id: string | undefined) {
  return useQuery({
    queryKey: ['business-hours-calendars', id],
    queryFn: () => apiFetch<BusinessHoursCalendar>(`/api/business-hours/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateBusinessHoursCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBusinessHoursCalendarInput) =>
      apiFetch<BusinessHoursCalendar>('/api/business-hours', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (calendar) => {
      queryClient.invalidateQueries({ queryKey: ['business-hours-calendars'] });
      toast.success(`Business hours calendar "${calendar.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateBusinessHoursCalendar(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBusinessHoursCalendarInput) =>
      apiFetch<BusinessHoursCalendar>(`/api/business-hours/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours-calendars'] });
      toast.success('Business hours calendar updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteBusinessHoursCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/business-hours/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours-calendars'] });
      toast.success('Business hours calendar deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** GET /business-hours-calendars/:id/holidays — only meaningful once the calendar exists, so the edit dialog's holiday sub-section (not the create dialog) is the only caller. */
export function useBusinessHolidays(calendarId: string | undefined) {
  return useQuery({
    queryKey: ['business-hours-calendars', calendarId, 'holidays'],
    queryFn: () => apiFetch<BusinessHoliday[]>(`/api/business-hours/${calendarId}/holidays`),
    enabled: Boolean(calendarId),
  });
}

export function useAddBusinessHoliday(calendarId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBusinessHolidayInput) =>
      apiFetch<BusinessHoliday>(`/api/business-hours/${calendarId}/holidays`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours-calendars', calendarId, 'holidays'] });
      toast.success('Holiday added');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Per-target editing after creation isn't wired up (delete + re-add covers it) — same convention as SlaTarget's UpdateSlaTargetInput/useUpdateSlaTarget being unused by the SLA policy dialog. */
export function useUpdateBusinessHoliday(calendarId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ holidayId, input }: { holidayId: string; input: UpdateBusinessHolidayInput }) =>
      apiFetch<BusinessHoliday>(`/api/business-hours/${calendarId}/holidays/${holidayId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours-calendars', calendarId, 'holidays'] });
      toast.success('Holiday updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteBusinessHoliday(calendarId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holidayId: string) => apiFetch<{ deleted: boolean }>(`/api/business-hours/${calendarId}/holidays/${holidayId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours-calendars', calendarId, 'holidays'] });
      toast.success('Holiday removed');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Agent skills — full CRUD (app/(cases)/agent-skills/**). Feeds the
// SKILL_BASED assignment rule engine's requiredSkillTags matching (see
// assignment-rules.controller.ts).
// ---------------------------------------------------------------------------

export function useAgentSkills() {
  return useQuery({
    queryKey: ['agent-skills'],
    queryFn: () => apiFetch<AgentSkill[]>('/api/agent-skills'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateAgentSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentSkillInput) => apiFetch<AgentSkill>('/api/agent-skills', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      toast.success('Agent skill added');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateAgentSkill(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAgentSkillInput) => apiFetch<AgentSkill>(`/api/agent-skills/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      toast.success('Agent skill updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteAgentSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/agent-skills/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      toast.success('Agent skill removed');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Directory (adjuster/assignee/watcher name lookups) + policy lookup
// ---------------------------------------------------------------------------

/**
 * GET /identity/users requires the `identity:read` permission (ADMIN/
 * COMPLIANCE_OFFICER only, see packages/db/prisma/seed.ts) — reuses the
 * Policy batch's existing app/api/identity-users proxy read-only rather
 * than duplicating it (same route already used by app/(policy)/**).
 * `retry: false` + a swallowed 403 lets adjuster/assignee/watcher pickers
 * degrade gracefully to a short id instead of breaking the page.
 */
export function useDirectoryUsers() {
  const query = useQuery({
    queryKey: ['identity-users'],
    queryFn: () => apiFetch<UserOption[]>('/api/identity-users'),
    retry: false,
    staleTime: 5 * 60_000,
    throwOnError: false,
  });
  // Memoized on query.data specifically (not the whole query object, which
  // TanStack Query gives a new reference every render regardless of
  // whether data actually changed) — every previous version of this hook
  // built a brand-new Map and, on every loading/error render, a brand-new
  // `[]` array literal, on every single call. Any consumer feeding either
  // into a useEffect/useMemo dependency array would see a "changed" value
  // every render, forever, regardless of whether the underlying data ever
  // changed — a textbook unstable-reference footgun.
  const users = useMemo(() => query.data ?? [], [query.data]);
  const usersById = useMemo(() => {
    const byId = new Map<string, UserOption>();
    for (const user of users) byId.set(user.id, user);
    return byId;
  }, [users]);
  return { usersById, users, isLoading: query.isLoading };
}

/**
 * GET /identity/teams requires the `identity:read` permission (ADMIN/
 * COMPLIANCE_OFFICER only, see packages/db/prisma/seed.ts) via
 * app/api/identity-teams — but the assignment rule form dialog that
 * consumes this (the only place `candidatePoolTeamId` is edited) is itself
 * gated on `sla_config:write`, which only ADMIN holds, and ADMIN already
 * has `identity:read:ALL` from its full-resource grant. `retry: false` +
 * a swallowed 403 (see identity-teams/route.ts) still lets the picker
 * degrade to an empty list rather than breaking the dialog for any role
 * this assumption turns out to be wrong for.
 *
 * Same unstable-reference footgun as useDirectoryUsers above — memoize the
 * derived array/Map on `query.data`, not on the query object itself.
 */
export function useTeams() {
  const query = useQuery({
    queryKey: ['identity-teams'],
    queryFn: () => apiFetch<TeamOption[]>('/api/identity-teams'),
    retry: false,
    staleTime: 5 * 60_000,
    throwOnError: false,
  });
  const teams = useMemo(() => query.data ?? [], [query.data]);
  const teamsById = useMemo(() => {
    const byId = new Map<string, TeamOption>();
    for (const team of teams) byId.set(team.id, team);
    return byId;
  }, [teams]);
  return { teamsById, teams, isLoading: query.isLoading };
}

/** id/name lookups for the "New claim"/"New ticket" dialogs' policyId + accountId selects — see app/api/policy-lookups/route.ts (extended by this batch to add `policies`). */
export function usePolicyLookups() {
  const query = useQuery({
    queryKey: ['policy-lookups'],
    queryFn: () => apiFetch<{ accounts: LookupOption[]; carriers: LookupOption[]; policies: LookupOption[] }>('/api/policy-lookups'),
    staleTime: 60_000,
  });
  return {
    accounts: query.data?.accounts ?? [],
    policies: query.data?.policies ?? [],
    isLoading: query.isLoading,
  };
}

// ---------------------------------------------------------------------------
// Permissions — Case Config button-gating (New/Edit/Delete visibility
// across the 7 sla-policies/macros/assignment-rules/business-hours/
// agent-skills/case-categories/loss-cause-categories list-view pages). The
// backend's @RequirePermission guard on each *.controller.ts endpoint is
// the real enforcement and is untouched by this — hiding a button someone
// can't use is purely a UX improvement, never a security boundary.
//
// Reuses GET /api/auth/session (lib/auth/use-current-user.ts's
// useCurrentUser(), rendered app-wide by app/app-header.tsx) rather than a
// dedicated fetch here — that route already proxies backend/api's
// GET /identity/me, which now also resolves a `permissions` array (see
// identity.controller.ts's resolveCaseConfigPermissions). Deliberately the
// SAME TanStack queryKey (['auth', 'current-user']) useCurrentUser() uses,
// so this shares its cache instead of firing a second request — by the
// time a Case Config page mounts, the header has almost always already
// populated it. A local, narrower type is declared below instead of
// importing lib/auth/types.ts's AuthenticatedUser, since that type
// (outside this batch's file scope) doesn't yet declare `permissions` —
// the JSON payload carries the field either way, this just types it for
// this file's own use.
// ---------------------------------------------------------------------------

interface SessionUserWithPermissions {
  id: string;
  permissions?: ResolvedPermission[];
}

function useSessionUser() {
  return useQuery({
    queryKey: ['auth', 'current-user'],
    queryFn: async (): Promise<SessionUserWithPermissions | null> => {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const body = (await res.json()) as { user: SessionUserWithPermissions | null };
      return body.user;
    },
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * True once the caller is confirmed to hold a `resource`/`action` grant at
 * any scope — mirrors PermissionGuard's own "does ANY RolePermission row
 * exist for this resource+action" check (common/auth/permission.guard.ts),
 * which is the actual 403 boundary this is predicting. Defaults to `false`
 * (button hidden) while the session is still loading/unauthenticated/
 * errored — fails closed, never shows a button before it's known the
 * caller can use it.
 *
 * Resource names here intentionally do NOT map one-to-one with the 7 Case
 * Config pages — they mirror each page's controller's actual
 * @RequirePermission decorator: `useCan('sla_config', 'write')` for
 * sla-policies/assignment-rules/business-hours/agent-skills,
 * `useCan('macro', 'write')` for macros, `useCan('case', 'write')` for
 * case-categories, `useCan('claim', 'write')` for loss-cause-categories.
 */
export function useCan(resource: string, action: 'read' | 'write' = 'write'): boolean {
  const { data: user } = useSessionUser();
  if (!user) return false;
  return (user.permissions ?? []).some((p) => p.resource === resource && p.action === action);
}
