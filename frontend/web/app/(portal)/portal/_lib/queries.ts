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
  PublicKnowledgeArticleDetail,
  PublicKnowledgeArticleListItem,
  PublicKnowledgeArticleQuery,
  PublicKnowledgeCategory,
  PublicKnowledgeVote,
} from './types';

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `?${query}` : '';
}

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

export function usePublicKnowledgeCategories() {
  return useQuery({
    queryKey: ['public-knowledge', 'categories'],
    queryFn: () => apiFetch<PublicKnowledgeCategory[]>('/api/public/knowledge/categories'),
    staleTime: 5 * 60_000,
  });
}

export function usePublicKnowledgeArticles(query: PublicKnowledgeArticleQuery) {
  return useQuery({
    queryKey: ['public-knowledge', 'articles', query],
    queryFn: () => apiFetch<PublicKnowledgeArticleListItem[]>(`/api/public/knowledge/articles${buildQuery(query)}`),
  });
}

export function usePublicKnowledgeArticle(slug: string) {
  return useQuery({
    queryKey: ['public-knowledge', 'article', slug],
    queryFn: () => apiFetch<PublicKnowledgeArticleDetail>(`/api/public/knowledge/articles/${encodeURIComponent(slug)}`),
    enabled: slug.length > 0,
    retry: false,
  });
}

/** Anonymous "was this helpful?" vote — see PublicKnowledgeArticleFeedbackDto's header comment (backend) for why this is a bare increment, not tied to any identity. */
export function useVotePublicKnowledgeArticle(slug: string) {
  return useMutation({
    mutationFn: (vote: PublicKnowledgeVote) =>
      apiFetch<{ helpfulCount: number }>(`/api/public/knowledge/articles/${encodeURIComponent(slug)}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ vote }),
      }),
  });
}
