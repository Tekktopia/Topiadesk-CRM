import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import type {
  CreatePortalCaseCommentInput,
  CreatePortalCaseInput,
  PortalCase,
  PortalCaseComment,
  PortalDocument,
  PortalMe,
  PortalPolicy,
} from './types';

export function usePortalMe() {
  return useQuery({ queryKey: ['portal', 'me'], queryFn: () => apiFetch<PortalMe>('/api/portal/me') });
}

export function usePortalPolicies() {
  return useQuery({ queryKey: ['portal', 'policies'], queryFn: () => apiFetch<PortalPolicy[]>('/api/portal/policies') });
}

export function usePortalPolicy(id: string) {
  return useQuery({ queryKey: ['portal', 'policies', id], queryFn: () => apiFetch<PortalPolicy>(`/api/portal/policies/${id}`) });
}

export function usePortalCases() {
  return useQuery({ queryKey: ['portal', 'cases'], queryFn: () => apiFetch<PortalCase[]>('/api/portal/cases') });
}

export function usePortalCase(id: string) {
  return useQuery({ queryKey: ['portal', 'cases', id], queryFn: () => apiFetch<PortalCase>(`/api/portal/cases/${id}`) });
}

export function useCreatePortalCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePortalCaseInput) => apiFetch<PortalCase>('/api/portal/cases', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'cases'] });
    },
  });
}

export function usePortalCaseComments(caseId: string) {
  return useQuery({
    queryKey: ['portal', 'cases', caseId, 'comments'],
    queryFn: () => apiFetch<PortalCaseComment[]>(`/api/portal/cases/${caseId}/comments`),
  });
}

export function useAddPortalCaseComment(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePortalCaseCommentInput) =>
      apiFetch<PortalCaseComment>(`/api/portal/cases/${caseId}/comments`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'cases', caseId, 'comments'] });
    },
  });
}

export function usePortalDocuments() {
  return useQuery({ queryKey: ['portal', 'documents'], queryFn: () => apiFetch<PortalDocument[]>('/api/portal/documents') });
}
