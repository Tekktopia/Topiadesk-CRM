'use client';

import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { EmptyState, ErrorState } from '../../_components/query-states';
import { formatDateTime } from '../../_lib/format';
import { useAddKnowledgeArticleVersion, useKnowledgeArticleVersions } from '../../_lib/queries';
import type { KnowledgeArticle, KnowledgeArticleVersion } from '../../_lib/types';

/**
 * Full version history — restore is implemented as "add a new version whose
 * body is the old version's content" (addKnowledgeArticleVersion), not a
 * dedicated restore endpoint: the backend has none (addVersion is the only
 * content-write path, and only while the article is DRAFT — see
 * KnowledgeArticlesService.addVersion()'s comment). "View diff" is
 * deliberately plain "view this version's content", not a real diff — the
 * task scope explicitly calls a fancy diff view unnecessary.
 */
export function VersionHistoryPanel({ article }: { article: KnowledgeArticle }) {
  const { user: currentUser } = useCurrentUser();
  const versionsQuery = useKnowledgeArticleVersions(article.id);
  const addVersion = useAddKnowledgeArticleVersion(article.id);
  const [viewing, setViewing] = useState<KnowledgeArticleVersion | null>(null);
  const [restoring, setRestoring] = useState<KnowledgeArticleVersion | null>(null);

  const canEdit = article.status === 'DRAFT';

  if (versionsQuery.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (versionsQuery.isError) return <ErrorState error={versionsQuery.error} />;
  const versions = versionsQuery.data ?? [];
  if (versions.length === 0) return <EmptyState icon={<History className="h-8 w-8" aria-hidden />} title="No versions yet" />;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Change note</TableHead>
            <TableHead>Authored by</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...versions].reverse().map((v) => {
            const isCurrent = v.id === article.currentVersionId;
            const isSelf = currentUser?.id === v.authoredById;
            return (
              <TableRow key={v.id}>
                <TableCell className="tabular-nums text-muted-foreground">
                  {v.versionNumber} {isCurrent ? <span className="ms-1 text-xs font-medium text-primary">(current)</span> : null}
                </TableCell>
                <TableCell className="max-w-[280px] truncate text-muted-foreground">{v.changeNote ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{isSelf ? 'You' : `User ${v.authoredById.slice(0, 8)}`}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(v.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => setViewing(v)}>
                      View
                    </Button>
                    {canEdit && !isCurrent ? (
                      <Button variant="outline" size="sm" onClick={() => setRestoring(v)}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version {viewing?.versionNumber}</DialogTitle>
            <DialogDescription>{viewing?.changeNote || 'No change note recorded.'}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
            {viewing?.bodyMarkdown}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={restoring !== null} onOpenChange={(open) => !open && setRestoring(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore version {restoring?.versionNumber}?</DialogTitle>
            <DialogDescription>
              This saves version {restoring?.versionNumber}&apos;s content as a new, current version — it doesn&apos;t delete anything in between.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoring(null)} disabled={addVersion.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!restoring) return;
                addVersion.mutate(
                  { bodyMarkdown: restoring.bodyMarkdown, changeNote: `Restored from version ${restoring.versionNumber}` },
                  { onSuccess: () => setRestoring(null) },
                );
              }}
              disabled={addVersion.isPending}
            >
              {addVersion.isPending ? 'Restoring…' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
