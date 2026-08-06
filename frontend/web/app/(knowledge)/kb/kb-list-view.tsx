'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Search } from 'lucide-react';
import { Badge, Card, CardContent, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@topiadesk/ui';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { formatDate } from '../_lib/format';
import { useDebouncedValue } from '../_lib/use-debounced-value';
import { usePublicKnowledgeArticles, usePublicKnowledgeCategories } from './_lib/queries';

const UNSET = '__any';

export function KbListView() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>(UNSET);
  const debouncedSearch = useDebouncedValue(search, 300);

  const categoriesQuery = usePublicKnowledgeCategories();
  const articlesQuery = usePublicKnowledgeArticles({
    q: debouncedSearch || undefined,
    categoryId: categoryId === UNSET ? undefined : categoryId,
  });
  const articles = articlesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Help Center"
        description="Answers to common questions about your policy, claims, and account — no sign-in required."
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="kb-search">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="kb-search"
                placeholder="Search articles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          {categories.length > 0 ? (
            <div className="w-full space-y-1.5 sm:w-56">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {articlesQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-none" />
          ))}
        </div>
      ) : articlesQuery.isError ? (
        <ErrorState error={articlesQuery.error} />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" aria-hidden />}
          title="No articles match your search"
          description="Try a different search term, or browse all categories."
        />
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <Link key={article.id} href={`/kb/${encodeURIComponent(article.slug)}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-col gap-1.5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-medium text-foreground">{article.title}</h2>
                    {article.categoryName ? (
                      <Badge variant="secondary" className="shrink-0">
                        {article.categoryName}
                      </Badge>
                    ) : null}
                  </div>
                  {article.publishedAt ? <p className="text-xs text-muted-foreground">Published {formatDate(article.publishedAt)}</p> : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
