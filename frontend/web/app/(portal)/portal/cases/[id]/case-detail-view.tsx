'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { PortalNav } from '../../_components/portal-nav';
import { ErrorState } from '../../_components/query-states';
import { formatDateTime } from '../../_lib/format';
import { useAddPortalCaseComment, usePortalCase, usePortalCaseComments } from '../../_lib/queries';

export function PortalCaseDetailView({ caseId }: { caseId: string }) {
  const [reply, setReply] = useState('');
  const caseQuery = usePortalCase(caseId);
  const commentsQuery = usePortalCaseComments(caseId);
  const addCommentMutation = useAddPortalCaseComment(caseId);
  const comments = commentsQuery.data ?? [];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    addCommentMutation.mutate({ body: reply.trim() }, { onSuccess: () => setReply('') });
  }

  return (
    <div>
      <PortalNav />
      <div className="space-y-4">
        <Link href="/portal/cases" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to support requests
        </Link>

        {caseQuery.isLoading ? (
          <Skeleton className="h-24 w-full rounded-none" />
        ) : caseQuery.isError ? (
          <ErrorState error={caseQuery.error} />
        ) : caseQuery.data ? (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{caseQuery.data.subject}</h2>
                  <p className="text-xs text-muted-foreground">
                    {caseQuery.data.caseNumber} · opened {formatDateTime(caseQuery.data.createdAt)}
                  </p>
                </div>
                <Badge>{caseQuery.data.status}</Badge>
              </div>
              {caseQuery.data.description ? <p className="border-t border-border pt-2 text-sm text-foreground">{caseQuery.data.description}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Conversation</h3>
          {commentsQuery.isLoading ? (
            <Skeleton className="h-16 w-full rounded-none" />
          ) : commentsQuery.isError ? (
            <ErrorState error={commentsQuery.error} />
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <Card key={comment.id} className={comment.direction === 'INBOUND' ? 'ml-8 bg-muted/30' : undefined}>
                  <CardContent className="space-y-1 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-foreground">{comment.authorLabel}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(comment.occurredAt)}</p>
                    </div>
                    {comment.body ? <p className="text-sm text-foreground">{comment.body}</p> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Write a reply…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          {addCommentMutation.isError ? (
            <p className="text-sm text-destructive">{addCommentMutation.error instanceof Error ? addCommentMutation.error.message : 'Something went wrong — please try again.'}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={addCommentMutation.isPending || reply.trim().length === 0} className="gap-1.5">
              <Send className="h-4 w-4" aria-hidden />
              {addCommentMutation.isPending ? 'Sending…' : 'Send reply'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
