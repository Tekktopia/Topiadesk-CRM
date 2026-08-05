'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@topiadesk/ui';
import { apiFetch, ApiError, buildQuery } from './api';
import type {
  CreateKnowledgeArticleInput,
  CreateKnowledgeArticleVersionInput,
  CreateKnowledgeCategoryInput,
  CreateSurveyInput,
  DecideKnowledgeApprovalInput,
  KnowledgeArticle,
  KnowledgeArticleFeedback,
  KnowledgeArticleQuery,
  KnowledgeArticleVersion,
  KnowledgeCategory,
  SubmitSurveyResponseInput,
  Survey,
  SurveyQuery,
  SurveyResponseQuery,
  SurveyResponseRecord,
  UpdateKnowledgeCategoryInput,
  UpdateSurveyInput,
  UpsertKnowledgeArticleFeedbackInput,
} from './types';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ---------------------------------------------------------------------------
// Knowledge categories
// ---------------------------------------------------------------------------

export function useKnowledgeCategories() {
  return useQuery({
    queryKey: ['knowledge', 'categories'],
    queryFn: () => apiFetch<KnowledgeCategory[]>('/api/knowledge-categories'),
  });
}

export function useCreateKnowledgeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKnowledgeCategoryInput) =>
      apiFetch<KnowledgeCategory>('/api/knowledge-categories', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Category created');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'categories'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to create category')),
  });
}

export function useUpdateKnowledgeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateKnowledgeCategoryInput }) =>
      apiFetch<KnowledgeCategory>(`/api/knowledge-categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Category updated');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'categories'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to update category')),
  });
}

export function useDeleteKnowledgeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: true }>(`/api/knowledge-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'categories'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to delete category')),
  });
}

// ---------------------------------------------------------------------------
// Knowledge articles
// ---------------------------------------------------------------------------

export function useKnowledgeArticles(query: KnowledgeArticleQuery = {}) {
  return useQuery({
    queryKey: ['knowledge', 'articles', query],
    queryFn: () => apiFetch<KnowledgeArticle[]>(`/api/knowledge-articles${buildQuery(query)}`),
  });
}

export function useKnowledgeArticle(id: string | undefined) {
  return useQuery({
    queryKey: ['knowledge', 'articles', id],
    queryFn: () => apiFetch<KnowledgeArticle>(`/api/knowledge-articles/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateKnowledgeArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKnowledgeArticleInput) =>
      apiFetch<KnowledgeArticle>('/api/knowledge-articles', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to create article')),
  });
}

export function useKnowledgeArticleVersions(articleId: string | undefined) {
  return useQuery({
    queryKey: ['knowledge', 'articles', articleId, 'versions'],
    queryFn: () => apiFetch<KnowledgeArticleVersion[]>(`/api/knowledge-articles/${articleId}/versions`),
    enabled: Boolean(articleId),
  });
}

export function useAddKnowledgeArticleVersion(articleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKnowledgeArticleVersionInput) =>
      apiFetch<KnowledgeArticle>(`/api/knowledge-articles/${articleId}/versions`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('New version saved');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles', articleId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles', articleId, 'versions'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save version')),
  });
}

export function useSubmitArticleForReview(articleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<KnowledgeArticle>(`/api/knowledge-articles/${articleId}/submit-for-review`, { method: 'POST' }),
    onSuccess: () => {
      toast.info('Submitted for approval — a different user must approve it before it publishes.');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles', articleId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to submit for review')),
  });
}

export function useDecideArticleApproval(articleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideKnowledgeApprovalInput) =>
      apiFetch<KnowledgeArticle>(`/api/knowledge-articles/${articleId}/decision`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (article) => {
      // 403 here (self-decision / no approval:write grant) is the expected
      // segregation-of-duties rejection, surfaced verbatim by onError below
      // rather than a generic failure message — same reasoning as
      // app/(policy)/policies/[id]/version-history.tsx's DecideDialog.
      toast.success(article.status === 'PUBLISHED' ? 'Approved — the article is now published.' : 'Rejected — sent back to draft.');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles', articleId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Decision failed')),
  });
}

export function useArchiveArticle(articleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<KnowledgeArticle>(`/api/knowledge-articles/${articleId}/archive`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Article archived');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles', articleId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to archive article')),
  });
}

export function useUpsertArticleFeedback(articleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertKnowledgeArticleFeedbackInput) =>
      apiFetch<KnowledgeArticleFeedback>(`/api/knowledge-articles/${articleId}/feedback`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Thanks for the feedback');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'articles', articleId] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to record feedback')),
  });
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

export function useSurveys(query: SurveyQuery = {}) {
  return useQuery({
    queryKey: ['knowledge', 'surveys', query],
    queryFn: () => apiFetch<Survey[]>(`/api/surveys${buildQuery(query)}`),
  });
}

export function useSurvey(id: string | undefined) {
  return useQuery({
    queryKey: ['knowledge', 'surveys', id],
    queryFn: () => apiFetch<Survey>(`/api/surveys/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSurveyInput) => apiFetch<Survey>('/api/surveys', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Survey created');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'surveys'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to create survey')),
  });
}

export function useUpdateSurvey(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSurveyInput) => apiFetch<Survey>(`/api/surveys/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Survey updated');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'surveys'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'surveys', id] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to update survey')),
  });
}

export function useSurveyResponses(surveyId: string | undefined, query: SurveyResponseQuery = {}) {
  return useQuery({
    queryKey: ['knowledge', 'surveys', surveyId, 'responses', query],
    queryFn: () => apiFetch<SurveyResponseRecord[]>(`/api/surveys/${surveyId}/responses${buildQuery(query)}`),
    enabled: Boolean(surveyId),
  });
}

// ---------------------------------------------------------------------------
// Public survey response submission (survey-respond/[token] page) — this is
// the one mutation in this file NOT gated behind a session; the BFF route it
// calls (app/api/surveys/responses/[id]/submit/route.ts) is itself public.
// ---------------------------------------------------------------------------

export function useSubmitSurveyResponse(responseId: string) {
  return useMutation({
    mutationFn: (input: SubmitSurveyResponseInput) =>
      apiFetch<{ status: 'recorded' }>(`/api/surveys/responses/${responseId}/submit`, { method: 'POST', body: JSON.stringify(input) }),
  });
}
