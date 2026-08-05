'use client';

import { useQuery } from '@tanstack/react-query';
// Reuses the route group's generic same-origin fetch helper — apiFetch()
// attaches no Authorization header and only forwards same-origin cookies
// (harmless for an anonymous GET with no session cookie present), so it
// works unmodified for this public surface too. See ../../_lib/api.ts's
// header comment for why it's a route-group-local copy rather than a
// cross-group import.
import { apiFetch, buildQuery } from '../../_lib/api';
import type { PublicKnowledgeArticleDetail, PublicKnowledgeArticleListItem, PublicKnowledgeArticleQuery, PublicKnowledgeCategory } from './types';

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
