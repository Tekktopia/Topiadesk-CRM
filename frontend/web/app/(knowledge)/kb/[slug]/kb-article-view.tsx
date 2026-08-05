'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { isApiErrorStatus } from '../../_lib/api';
import { formatDate } from '../../_lib/format';
// Reused as-is from the internal editor's preview toggle — dependency-free
// Markdown -> HTML with HTML-escaping built in first (see that file's
// header comment, which explicitly calls out CUSTOMER visibility as the
// "later external exposure" this was already written safe-by-default for).
import { markdownToHtml } from '../../_lib/markdown-preview';
import { usePublicKnowledgeArticle } from '../_lib/queries';

export function KbArticleView({ slug }: { slug: string }) {
  const articleQuery = usePublicKnowledgeArticle(slug);
  const bodyHtml = useMemo(() => markdownToHtml(articleQuery.data?.bodyMarkdown ?? ''), [articleQuery.data?.bodyMarkdown]);

  const notFound = isApiErrorStatus(articleQuery.error, 404);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/kb" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Help Center
      </Link>

      {articleQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : notFound ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-foreground">Article not found</p>
            <p className="max-w-md text-sm text-muted-foreground">
              This article may have been unpublished or moved. Try searching the Help Center instead.
            </p>
          </CardContent>
        </Card>
      ) : articleQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-foreground">Couldn&apos;t load this article</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {articleQuery.error instanceof Error ? articleQuery.error.message : 'Please try again in a moment.'}
            </p>
          </CardContent>
        </Card>
      ) : articleQuery.data ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">{articleQuery.data.title}</h1>
                {articleQuery.data.categoryName ? <Badge variant="secondary">{articleQuery.data.categoryName}</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">Last updated {formatDate(articleQuery.data.updatedAt)}</p>
            </div>
            <div
              className="prose-sm text-sm text-foreground [&_a]:text-primary [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:mb-1 [&_h3]:mt-3 [&_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
