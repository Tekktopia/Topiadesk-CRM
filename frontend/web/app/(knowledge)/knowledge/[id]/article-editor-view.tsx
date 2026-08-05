'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { EmptyState, ErrorState } from '../../_components/query-states';
import { articleStatusLabel, articleStatusVariant, visibilityLabel, visibilityVariant } from '../../_lib/constants';
import { formatDateTime } from '../../_lib/format';
import { markdownToHtml } from '../../_lib/markdown-preview';
import {
  useAddKnowledgeArticleVersion,
  useArchiveArticle,
  useKnowledgeArticle,
  useKnowledgeArticleVersions,
  useKnowledgeCategories,
  useSubmitArticleForReview,
  useUpsertArticleFeedback,
} from '../../_lib/queries';
import { ArticleDecisionDialog } from './article-decision-dialog';
import { VersionHistoryPanel } from './version-history-panel';

export function ArticleEditorView({ articleId }: { articleId: string }) {
  const { user: currentUser } = useCurrentUser();
  const articleQuery = useKnowledgeArticle(articleId);
  const versionsQuery = useKnowledgeArticleVersions(articleId);
  const categoriesQuery = useKnowledgeCategories();
  const categoryNameById = useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);

  const submitForReview = useSubmitArticleForReview(articleId);
  const archiveArticle = useArchiveArticle(articleId);
  const addVersion = useAddKnowledgeArticleVersion(articleId);
  const upsertFeedback = useUpsertArticleFeedback(articleId);
  const [decisionOpen, setDecisionOpen] = useState(false);

  const currentVersion = useMemo(
    () => (versionsQuery.data ?? []).find((v) => v.id === articleQuery.data?.currentVersionId) ?? (versionsQuery.data ?? []).at(-1),
    [versionsQuery.data, articleQuery.data?.currentVersionId],
  );

  const [draftBody, setDraftBody] = useState('');
  const [changeNote, setChangeNote] = useState('');
  useEffect(() => {
    setDraftBody(currentVersion?.bodyMarkdown ?? '');
    // Versions are immutable rows — bodyMarkdown only ever changes when the
    // version id does, so both deps fire together.
  }, [currentVersion?.id, currentVersion?.bodyMarkdown]);

  const previewHtml = useMemo(() => markdownToHtml(draftBody), [draftBody]);

  if (articleQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (articleQuery.isError || !articleQuery.data) {
    return (
      <div className="space-y-4">
        <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Knowledge Base
        </Link>
        <ErrorState error={articleQuery.error ?? new Error('Article not found')} />
      </div>
    );
  }

  const article = articleQuery.data;
  const isDraft = article.status === 'DRAFT';
  const isInReview = article.status === 'IN_REVIEW';
  const isPublished = article.status === 'PUBLISHED';
  const isOwner = currentUser?.id === article.ownerId;
  const bodyChanged = draftBody !== (currentVersion?.bodyMarkdown ?? '');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Knowledge Base
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{article.title}</h1>
              <Badge variant={articleStatusVariant(article.status)}>{articleStatusLabel(article.status)}</Badge>
              <Badge variant={visibilityVariant(article.visibility)}>{visibilityLabel(article.visibility)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              /{article.slug} · {article.categoryId ? (categoryNameById.get(article.categoryId) ?? 'Unknown category') : 'Uncategorized'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDraft && article.currentVersionId ? (
              <Button onClick={() => submitForReview.mutate()} disabled={submitForReview.isPending}>
                {submitForReview.isPending ? 'Submitting…' : 'Submit for review'}
              </Button>
            ) : null}
            {isPublished ? (
              <Button variant="outline" onClick={() => archiveArticle.mutate()} disabled={archiveArticle.isPending}>
                {archiveArticle.isPending ? 'Archiving…' : 'Archive'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 py-6 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="Owner" value={isOwner ? 'You' : `User ${article.ownerId.slice(0, 8)}`} />
          <Fact label="Locale" value={article.locale} />
          <Fact label="Views" value={String(article.viewCount)} />
          <Fact label="Created" value={formatDateTime(article.createdAt)} />
          <Fact label="Published" value={formatDateTime(article.publishedAt)} />
        </CardContent>
      </Card>

      {isInReview ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Awaiting publish approval</p>
              <p className="text-sm text-muted-foreground">
                {isOwner
                  ? 'You requested this — a different user with approval rights must decide it (segregation of duties).'
                  : 'A different user must decide this than the one who requested it.'}
              </p>
            </div>
            <Button variant="outline" onClick={() => setDecisionOpen(true)} disabled={isOwner}>
              Decide
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="versions">Version history</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-3 pt-4">
          {!isDraft ? (
            <p className="text-xs text-muted-foreground">
              Content can only be edited while the article is DRAFT — reject it (if IN_REVIEW) or start a fresh article to make further changes.
            </p>
          ) : null}
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="pt-3">
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                readOnly={!isDraft}
                rows={16}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground read-only:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </TabsContent>
            <TabsContent value="preview" className="pt-3">
              <div
                className="prose-sm min-h-[24rem] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-foreground [&_a]:text-primary [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:mb-1 [&_h3]:mt-3 [&_p]:mb-3"
                dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
              />
            </TabsContent>
          </Tabs>
          {isDraft ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[240px] flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="change-note">
                  Change note (optional)
                </label>
                <input
                  id="change-note"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="What changed in this version?"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
              </div>
              <Button
                disabled={!bodyChanged || draftBody.trim().length === 0 || addVersion.isPending}
                onClick={() =>
                  addVersion.mutate({ bodyMarkdown: draftBody, changeNote: changeNote || undefined }, { onSuccess: () => setChangeNote('') })
                }
              >
                {addVersion.isPending ? 'Saving…' : 'Save new version'}
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="versions" className="pt-4">
          <VersionHistoryPanel article={article} />
        </TabsContent>

        <TabsContent value="feedback" className="pt-4">
          <Card>
            <CardContent className="space-y-4 py-6">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <ThumbsUp className="h-4 w-4 text-success" aria-hidden />
                  <span className="font-semibold tabular-nums">{article.helpfulCount}</span> helpful
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <ThumbsDown className="h-4 w-4 text-destructive" aria-hidden />
                  <span className="font-semibold tabular-nums">{article.notHelpfulCount}</span> not helpful
                </div>
              </div>
              {isPublished ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Was this article helpful?</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={upsertFeedback.isPending}
                    onClick={() => upsertFeedback.mutate({ vote: 'HELPFUL' })}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Yes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={upsertFeedback.isPending}
                    onClick={() => upsertFeedback.mutate({ vote: 'NOT_HELPFUL' })}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden /> No
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Feedback opens up once the article is published.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(versionsQuery.data ?? []).length === 0 && !isDraft ? <EmptyState title="No content versions recorded" /> : null}

      <ArticleDecisionDialog articleId={article.id} open={decisionOpen} onOpenChange={setDecisionOpen} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
