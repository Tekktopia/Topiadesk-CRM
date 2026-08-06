'use client';

import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from '@topiadesk/ui';
import { apiFetch, ApiRequestError, buildQuery } from './api';
import type {
  Account,
  AccountDetail,
  AccountQuery,
  Activity,
  ActivityQuery,
  BulkActionResponse,
  BulkAssignInput,
  BulkDeleteInput,
  Carrier,
  CheckAccountDuplicatesQuery,
  CheckContactOrLeadDuplicatesQuery,
  Contact,
  ContactQuery,
  ConvertLeadInput,
  ConvertLeadResponse,
  CreateAccountInput,
  CreateActivityInput,
  CreateCarrierInput,
  CreateContactInput,
  CreateCustomFieldDefinitionInput,
  CreateLeadInput,
  CreateMarketSubmissionInput,
  CreateOpportunityInput,
  CreateSalesQuotaInput,
  CreateSavedViewInput,
  CreateTaskInput,
  CustomFieldDefinition,
  CustomFieldEntityType,
  DirectoryUser,
  DuplicateGroup,
  Lead,
  LeadQuery,
  LoyaltyAccount,
  LoyaltyTransaction,
  MarketSubmission,
  MergeResponse,
  Opportunity,
  OpportunityQuery,
  PipelineDetail,
  Pipeline,
  QuotaAttainment,
  RunSavedViewResult,
  SalesQuota,
  SavedView,
  SavedViewEntityType,
  Task,
  TaskQuery,
  UpdateAccountInput,
  UpdateCarrierInput,
  UpdateContactInput,
  UpdateCustomFieldDefinitionInput,
  UpdateLeadInput,
  UpdateOpportunityInput,
  UpdateOpportunityStageInput,
  UpdateSalesQuotaInput,
  UpdateSavedViewInput,
  UpdateTaskInput,
} from './types';

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.';
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function useAccounts(query: AccountQuery = {}) {
  return useQuery({
    queryKey: ['crm', 'accounts', query],
    queryFn: () => apiFetch<Account[]>(`/api/crm/accounts${buildQuery(query)}`),
  });
}

export function useAccount(id: string | undefined, options?: Partial<UseQueryOptions<AccountDetail>>) {
  return useQuery({
    queryKey: ['crm', 'accounts', id],
    queryFn: () => apiFetch<AccountDetail>(`/api/crm/accounts/${id}`),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) =>
      apiFetch<Account>('/api/crm/accounts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'accounts'] });
      toast.success(`Account "${account.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateAccount(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccountInput) =>
      apiFetch<Account>(`/api/crm/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'accounts'] });
      toast.success('Account updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/crm/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'accounts'] });
      toast.success('Account deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Small id->name lookup for cards/lists that only carry a raw accountId (e.g. the opportunity Kanban). */
export function useAccountsLookup() {
  const query = useAccounts({ take: 250 });
  const byId = new Map<string, Account>();
  for (const account of query.data ?? []) byId.set(account.id, account);
  return { accountsById: byId, isLoading: query.isLoading };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function useContacts(query: ContactQuery) {
  return useQuery({
    queryKey: ['crm', 'contacts', query],
    queryFn: () => apiFetch<Contact[]>(`/api/crm/contacts${buildQuery(query)}`),
    enabled: Boolean(query.accountId || query.carrierId),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      apiFetch<Contact>('/api/crm/contacts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      if (contact.accountId) queryClient.invalidateQueries({ queryKey: ['crm', 'accounts', contact.accountId] });
      toast.success('Contact added');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateContact(accountId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactInput }) =>
      apiFetch<Contact>(`/api/crm/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      if (accountId) queryClient.invalidateQueries({ queryKey: ['crm', 'accounts', accountId] });
      toast.success('Contact updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteContact(accountId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/crm/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      if (accountId) queryClient.invalidateQueries({ queryKey: ['crm', 'accounts', accountId] });
      toast.success('Contact removed');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Carriers
// ---------------------------------------------------------------------------

export function useCarriers() {
  return useQuery({
    queryKey: ['crm', 'carriers'],
    queryFn: () => apiFetch<Carrier[]>('/api/crm/carriers'),
  });
}

export function useCarrier(id: string | undefined) {
  return useQuery({
    queryKey: ['crm', 'carriers', id],
    queryFn: () => apiFetch<Carrier>(`/api/crm/carriers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCarrier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCarrierInput) =>
      apiFetch<Carrier>('/api/crm/carriers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (carrier) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'carriers'] });
      toast.success(`Carrier "${carrier.name}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateCarrier(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCarrierInput) =>
      apiFetch<Carrier>(`/api/crm/carriers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'carriers'] });
      toast.success('Carrier updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteCarrier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/crm/carriers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'carriers'] });
      toast.success('Carrier deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export function useLeads(query: LeadQuery = {}) {
  return useQuery({
    queryKey: ['crm', 'leads', query],
    queryFn: () => apiFetch<Lead[]>(`/api/crm/leads${buildQuery(query)}`),
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['crm', 'leads', id],
    queryFn: () => apiFetch<Lead>(`/api/crm/leads/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) =>
      apiFetch<Lead>('/api/crm/leads', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
      toast.success('Lead created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateLead(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLeadInput) =>
      apiFetch<Lead>(`/api/crm/leads/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
      toast.success('Lead updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/crm/leads/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
      toast.success('Lead deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useConvertLead(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConvertLeadInput) =>
      apiFetch<ConvertLeadResponse>(`/api/crm/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'accounts'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      toast.success('Lead converted — account and opportunity created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export function usePipelines() {
  return useQuery({
    queryKey: ['crm', 'pipelines'],
    queryFn: () => apiFetch<Pipeline[]>('/api/crm/pipelines'),
    staleTime: 5 * 60_000,
  });
}

export function usePipeline(id: string | undefined) {
  return useQuery({
    queryKey: ['crm', 'pipelines', id],
    queryFn: () => apiFetch<PipelineDetail>(`/api/crm/pipelines/${id}`),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetches every Pipeline + its stages and flattens them into a single
 * stageId -> stage (+ pipelineName) lookup. Only 2 pipelines / ~10 stages
 * exist at seeded-demo scale (New Business, Renewals — see
 * packages/db/prisma/seed.ts), so N+1-fetching each pipeline's detail is
 * cheap and avoids a dedicated backend "all stages" endpoint. Powers stage
 * name display on the Opportunities Kanban, opportunity detail, and the
 * Lead conversion dialog's cascading pipeline -> stage picker.
 */
export function useAllPipelineStages() {
  const pipelinesQuery = usePipelines();
  const pipelineIds = (pipelinesQuery.data ?? []).map((p) => p.id);
  const detailQueries = useQueries({
    queries: pipelineIds.map((id) => ({
      queryKey: ['crm', 'pipelines', id],
      queryFn: () => apiFetch<PipelineDetail>(`/api/crm/pipelines/${id}`),
      staleTime: 5 * 60_000,
    })),
  });

  const stagesById = new Map<string, { id: string; name: string; order: number; isWon: boolean; isLost: boolean; defaultProbability: number; pipelineId: string; pipelineName: string }>();
  for (const detail of detailQueries) {
    if (!detail.data) continue;
    for (const stage of detail.data.stages) {
      stagesById.set(stage.id, { ...stage, pipelineName: detail.data.name });
    }
  }

  return {
    stagesById,
    pipelines: pipelinesQuery.data ?? [],
    isLoading: pipelinesQuery.isLoading || detailQueries.some((q) => q.isLoading),
  };
}

/**
 * backend/api's TasksController.list() only filters by assigneeId/status/
 * dueBefore/dueAfter/caseId (see backend/api/src/modules/crm/tasks.controller.ts)
 * — there is still no accountId/opportunityId/leadId/policyId query param
 * even though the Task model carries those FKs, so an account/lead/
 * opportunity detail page's "related tasks" still can't be filtered
 * server-side. Those four stay client-filtered over the full (RLS-scoped)
 * task list — fine at this module's seeded-demo scale. `caseId` closed
 * this gap for the ticket detail page specifically (a real backend param
 * now exists), so it's passed straight through to useTasks() instead.
 */
export function useTasksForEntity(filter: {
  accountId?: string;
  opportunityId?: string;
  leadId?: string;
  policyId?: string;
  caseId?: string;
}) {
  const query = useTasks(filter.caseId ? { caseId: filter.caseId } : {});
  const data = (query.data ?? []).filter(
    (task) =>
      (!filter.accountId || task.accountId === filter.accountId) &&
      (!filter.opportunityId || task.opportunityId === filter.opportunityId) &&
      (!filter.leadId || task.leadId === filter.leadId) &&
      (!filter.policyId || task.policyId === filter.policyId) &&
      (!filter.caseId || task.caseId === filter.caseId),
  );
  return { data, isLoading: query.isLoading };
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export function useOpportunities(query: OpportunityQuery = {}) {
  return useQuery({
    queryKey: ['crm', 'opportunities', query],
    queryFn: () => apiFetch<Opportunity[]>(`/api/crm/opportunities${buildQuery(query)}`),
  });
}

export function useOpportunity(id: string | undefined) {
  return useQuery({
    queryKey: ['crm', 'opportunities', id],
    queryFn: () => apiFetch<Opportunity>(`/api/crm/opportunities/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOpportunityInput) =>
      apiFetch<Opportunity>('/api/crm/opportunities', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      toast.success('Opportunity created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateOpportunity(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOpportunityInput) =>
      apiFetch<Opportunity>(`/api/crm/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      toast.success('Opportunity updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/crm/opportunities/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      toast.success('Opportunity deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Powers the Kanban board's stage-transition buttons/menu. */
export function useUpdateOpportunityStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOpportunityStageInput }) =>
      apiFetch<Opportunity>(`/api/crm/opportunities/${id}/stage`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      toast.success('Stage updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useMarketSubmissions(opportunityId: string | undefined) {
  return useQuery({
    queryKey: ['crm', 'opportunities', opportunityId, 'market-submissions'],
    queryFn: () => apiFetch<MarketSubmission[]>(`/api/crm/opportunities/${opportunityId}/market-submissions`),
    enabled: Boolean(opportunityId),
  });
}

export function useCreateMarketSubmission(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMarketSubmissionInput) =>
      apiFetch<MarketSubmission>(`/api/crm/opportunities/${opportunityId}/market-submissions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities', opportunityId, 'market-submissions'] });
      toast.success('Carrier submission logged');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export function useActivities(query: ActivityQuery) {
  const enabled = Boolean(query.accountId || query.opportunityId || query.leadId || query.policyId);
  return useQuery({
    queryKey: ['crm', 'activities', query],
    queryFn: () => apiFetch<Activity[]>(`/api/crm/activities${buildQuery(query)}`),
    enabled,
  });
}

export function useCreateActivity(invalidateKey: unknown[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateActivityInput) =>
      apiFetch<Activity>('/api/crm/activities', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      toast.success('Activity logged');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function useTasks(query: TaskQuery = {}) {
  return useQuery({
    queryKey: ['crm', 'tasks', query],
    queryFn: () => apiFetch<Task[]>(`/api/crm/tasks${buildQuery(query)}`),
  });
}

export function useMyTasks(query: Omit<TaskQuery, 'assigneeId'> = {}) {
  return useQuery({
    queryKey: ['crm', 'tasks', 'mine', query],
    queryFn: () => apiFetch<Task[]>(`/api/crm/tasks/mine${buildQuery(query)}`),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiFetch<Task>('/api/crm/tasks', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tasks'] });
      toast.success('Task created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      apiFetch<Task>(`/api/crm/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tasks'] });
      toast.success('Task updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/crm/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tasks'] });
      toast.success('Task deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Directory (owner/assignee name lookups)
// ---------------------------------------------------------------------------

/**
 * GET /identity/users requires the `identity:read` permission, which only
 * ADMIN and COMPLIANCE_OFFICER hold (see packages/db/prisma/seed.ts) — a
 * MANAGER or ACCOUNT_HANDLER calling this will get a 403. `retry: false` +
 * treating any error as "no directory available" lets owner/assignee
 * columns degrade gracefully to a short id instead of breaking the page.
 */
export function useDirectoryUsers() {
  const query = useQuery({
    queryKey: ['crm', 'users'],
    queryFn: () => apiFetch<DirectoryUser[]>('/api/crm/users'),
    retry: false,
    staleTime: 5 * 60_000,
    throwOnError: false,
  });
  const byId = new Map<string, DirectoryUser>();
  for (const user of query.data ?? []) byId.set(user.id, user);
  return { usersById: byId, isLoading: query.isLoading };
}

// ---------------------------------------------------------------------------
// Phase 2: Custom field definitions
// ---------------------------------------------------------------------------

export function useCustomFieldDefinitions(entityType?: CustomFieldEntityType) {
  return useQuery({
    queryKey: ['crm', 'custom-field-definitions', entityType],
    queryFn: () => apiFetch<CustomFieldDefinition[]>(`/api/crm/custom-field-definitions${buildQuery({ entityType })}`),
    staleTime: 60_000,
  });
}

export function useCreateCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomFieldDefinitionInput) =>
      apiFetch<CustomFieldDefinition>('/api/crm/custom-field-definitions', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (def) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'custom-field-definitions'] });
      toast.success(`Custom field "${def.label}" created`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateCustomFieldDefinition(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCustomFieldDefinitionInput) =>
      apiFetch<CustomFieldDefinition>(`/api/crm/custom-field-definitions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'custom-field-definitions'] });
      toast.success('Custom field updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Soft-delete only (sets isActive=false) — see custom-field-definitions.controller.ts's header comment. */
export function useDeactivateCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deactivated: boolean }>(`/api/crm/custom-field-definitions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'custom-field-definitions'] });
      toast.success('Custom field deactivated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Phase 2: Saved views
// ---------------------------------------------------------------------------

export function useSavedViews(entityType: SavedViewEntityType) {
  return useQuery({
    queryKey: ['crm', 'saved-views', entityType],
    queryFn: () => apiFetch<SavedView[]>(`/api/crm/saved-views${buildQuery({ entityType })}`),
  });
}

export function useCreateSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedViewInput) =>
      apiFetch<SavedView>('/api/crm/saved-views', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (view) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'saved-views', view.entityType] });
      toast.success(`View "${view.name}" saved`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateSavedView(id: string, entityType: SavedViewEntityType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSavedViewInput) =>
      apiFetch<SavedView>(`/api/crm/saved-views/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'saved-views', entityType] });
      toast.success('View updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteSavedView(entityType: SavedViewEntityType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/crm/saved-views/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'saved-views', entityType] });
      toast.success('View deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Runs a saved view server-side (its stored filters/sort) and returns the matching rows, already shaped like the entity's normal list response. */
export function useRunSavedView<T>() {
  return useMutation({
    mutationFn: ({ id, take, skip }: { id: string; take?: number; skip?: number }) =>
      apiFetch<RunSavedViewResult<T>>(`/api/crm/saved-views/${id}/run${buildQuery({ take, skip })}`, { method: 'POST' }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Phase 2: Sales quotas
// ---------------------------------------------------------------------------

export function useSalesQuotas(query: { scopeType?: SalesQuota['scopeType']; userId?: string } = {}) {
  return useQuery({
    queryKey: ['crm', 'sales-quotas', query],
    queryFn: () => apiFetch<SalesQuota[]>(`/api/crm/sales-quotas${buildQuery(query)}`),
  });
}

export function useCreateSalesQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesQuotaInput) =>
      apiFetch<SalesQuota>('/api/crm/sales-quotas', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'sales-quotas'] });
      toast.success('Sales quota created');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateSalesQuota(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSalesQuotaInput) =>
      apiFetch<SalesQuota>(`/api/crm/sales-quotas/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'sales-quotas'] });
      toast.success('Sales quota updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useQuotaAttainment(id: string | undefined) {
  return useQuery({
    queryKey: ['crm', 'sales-quotas', id, 'attainment'],
    queryFn: () => apiFetch<QuotaAttainment>(`/api/crm/sales-quotas/${id}/attainment`),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Phase 2: Duplicate detection & merge
// ---------------------------------------------------------------------------

export function useCheckAccountDuplicates() {
  return useMutation({
    mutationFn: (query: CheckAccountDuplicatesQuery) =>
      apiFetch<DuplicateGroup[]>(`/api/crm/accounts/check-duplicates${buildQuery(query)}`),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useCheckContactDuplicates() {
  return useMutation({
    mutationFn: (query: CheckContactOrLeadDuplicatesQuery) =>
      apiFetch<DuplicateGroup[]>(`/api/crm/contacts/check-duplicates${buildQuery(query)}`),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useCheckLeadDuplicates() {
  return useMutation({
    mutationFn: (query: CheckContactOrLeadDuplicatesQuery) =>
      apiFetch<DuplicateGroup[]>(`/api/crm/leads/check-duplicates${buildQuery(query)}`),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/**
 * Merge mutations deliberately do NOT toast on error (unlike every other
 * mutation in this file) — merge.ts can reject with a specific
 * BadRequestException (e.g. "N ticket(s) still reference the loser account")
 * that the merge dialog needs to show inline next to the form, not just as a
 * transient toast. Callers should read `.error` off the mutation result.
 */
export function useMergeAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ winnerId, loserId }: { winnerId: string; loserId: string }) =>
      apiFetch<MergeResponse>(`/api/crm/accounts/${winnerId}/merge`, { method: 'POST', body: JSON.stringify({ loserId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'accounts'] });
      toast.success('Accounts merged');
    },
  });
}

export function useMergeContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ winnerId, loserId }: { winnerId: string; loserId: string }) =>
      apiFetch<MergeResponse>(`/api/crm/contacts/${winnerId}/merge`, { method: 'POST', body: JSON.stringify({ loserId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      toast.success('Contacts merged');
    },
  });
}

export function useMergeLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ winnerId, loserId }: { winnerId: string; loserId: string }) =>
      apiFetch<MergeResponse>(`/api/crm/leads/${winnerId}/merge`, { method: 'POST', body: JSON.stringify({ loserId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
      toast.success('Leads merged');
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 2: Bulk actions
// ---------------------------------------------------------------------------

export function useBulkAssignAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAssignInput) =>
      apiFetch<BulkActionResponse>('/api/crm/accounts/bulk/assign', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'accounts'] });
      toast.success(`Reassigned ${res.updated.length} account(s)${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useBulkDeleteAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkDeleteInput) =>
      apiFetch<BulkActionResponse>('/api/crm/accounts/bulk/delete', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'accounts'] });
      toast.success(`Deleted ${res.updated.length} account(s)${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useBulkAssignLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAssignInput) =>
      apiFetch<BulkActionResponse>('/api/crm/leads/bulk/assign', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
      toast.success(`Reassigned ${res.updated.length} lead(s)${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useBulkDeleteLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkDeleteInput) =>
      apiFetch<BulkActionResponse>('/api/crm/leads/bulk/delete', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
      toast.success(`Deleted ${res.updated.length} lead(s)${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useBulkAssignOpportunities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAssignInput) =>
      apiFetch<BulkActionResponse>('/api/crm/opportunities/bulk/assign', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      toast.success(`Reassigned ${res.updated.length} opportunity(ies)${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useBulkDeleteOpportunities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkDeleteInput) =>
      apiFetch<BulkActionResponse>('/api/crm/opportunities/bulk/delete', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
      toast.success(`Deleted ${res.updated.length} opportunity(ies)${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// --- Phase 2: Customer Loyalty ---

/** Returns null (not an error) when the account isn't enrolled yet — the account-detail Loyalty tab uses that to show an "Enroll" prompt instead of an error state. */
export function useLoyaltyAccountByAccountId(accountId: string) {
  return useQuery({
    queryKey: ['crm', 'loyalty-account', 'by-account', accountId],
    queryFn: () => apiFetch<LoyaltyAccount | null>(`/api/loyalty-accounts/by-account/${accountId}`),
    enabled: Boolean(accountId),
  });
}

export function useLoyaltyAccounts(search?: string) {
  return useQuery({
    queryKey: ['crm', 'loyalty-accounts', search ?? ''],
    queryFn: () => apiFetch<LoyaltyAccount[]>(`/api/loyalty-accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });
}

export function useLoyaltyTransactions(loyaltyAccountId: string | undefined) {
  return useQuery({
    queryKey: ['crm', 'loyalty-transactions', loyaltyAccountId],
    queryFn: () => apiFetch<LoyaltyTransaction[]>(`/api/loyalty-accounts/${loyaltyAccountId}/transactions`),
    enabled: Boolean(loyaltyAccountId),
  });
}

export function useEnrollLoyaltyAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => apiFetch<LoyaltyAccount>('/api/loyalty-accounts', { method: 'POST', body: JSON.stringify({ accountId }) }),
    onSuccess: (loyaltyAccount) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'loyalty-account', 'by-account', loyaltyAccount.accountId] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'loyalty-accounts'] });
      toast.success('Enrolled in the loyalty program');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

interface PostPointsInput {
  loyaltyAccountId: string;
  accountId: string;
  points: number;
  reason: string;
  relatedPolicyId?: string;
}

function useLoyaltyLedgerMutation(action: 'earn' | 'redeem' | 'adjust', successVerb: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loyaltyAccountId, points, reason, relatedPolicyId }: PostPointsInput) =>
      apiFetch<LoyaltyTransaction>(`/api/loyalty-accounts/${loyaltyAccountId}/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'earn' ? { points, reason, relatedPolicyId } : { points, reason }),
      }),
    onSuccess: (_txn, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'loyalty-account', 'by-account', vars.accountId] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'loyalty-transactions', vars.loyaltyAccountId] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'loyalty-accounts'] });
      toast.success(`Points ${successVerb}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useEarnPoints() {
  return useLoyaltyLedgerMutation('earn', 'earned');
}

export function useRedeemPoints() {
  return useLoyaltyLedgerMutation('redeem', 'redeemed');
}

export function useAdjustPoints() {
  return useLoyaltyLedgerMutation('adjust', 'adjusted');
}
