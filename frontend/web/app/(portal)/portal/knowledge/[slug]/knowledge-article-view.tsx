'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { PortalNav } from '../../_components/portal-nav';
import { isApiErrorStatus } from '../../_lib/api';
import { formatDate } from '../../_lib/format';
import { markdownToHtml } from '../../_lib/markdown-preview';
import { usePublicKnowledgeArticle, useVotePublicKnowledgeArticle } from '../../_lib/queries';
import type { PublicKnowledgeVote } from '../../_lib/types';

export function PortalKnowledgeArticleView({ slug }: { slug: string }) {
  const articleQuery = usePublicKnowledgeArticle(slug);
  const bodyHtml = useMemo(() => markdownToHtml(articleQuery.data?.bodyMarkdown ?? ''), [articleQuery.data?.bodyMarkdown]);

  const notFound = isApiErrorStatus(articleQuery.error, 404);

  return (
    <div>
      <PortalNav />
      <div className="space-y-4">
        <Link href="/portal/knowledge" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Help Center
        </Link>

        {articleQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-64 w-full rounded-none" />
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
              <ArticleFeedback slug={slug} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Was this helpful?" — local copy of app/(knowledge)/kb/[slug]/kb-article-view.tsx's
 * identical widget (see _lib/api.ts's header comment for why route groups
 * each keep their own). Anonymous, one-shot vote per pageview — see
 * useVotePublicKnowledgeArticle's own comment for why there's no real
 * server-side dedup to match against here.
 */
function ArticleFeedback({ slug }: { slug: string }) {
  const [voted, setVoted] = useState<PublicKnowledgeVote | null>(null);
  const vote = useVotePublicKnowledgeArticle(slug);

  function handleVote(value: PublicKnowledgeVote) {
    if (voted || vote.isPending) return;
    vote.mutate(value, { onSuccess: () => setVoted(value) });
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {voted ? (
          <p className="text-sm text-muted-foreground">Thanks for your feedback!</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Was this article helpful?</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleVote('HELPFUL')} disabled={vote.isPending}>
                <ThumbsUp className="h-4 w-4" aria-hidden /> Yes
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleVote('NOT_HELPFUL')} disabled={vote.isPending}>
                <ThumbsDown className="h-4 w-4" aria-hidden /> No
              </Button>
            </div>
          </>
        )}
      </div>
      {vote.isError ? <p className="text-xs text-destructive">Couldn&apos;t record your feedback — please try again.</p> : null}
    </div>
  );
}
