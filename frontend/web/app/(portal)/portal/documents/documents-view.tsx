'use client';

import { Download, FileText } from 'lucide-react';
import { Button, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { PortalNav } from '../_components/portal-nav';
import { EmptyState, ErrorState } from '../_components/query-states';
import { formatDate } from '../_lib/format';
import { usePortalDocuments } from '../_lib/queries';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalDocumentsView() {
  const documentsQuery = usePortalDocuments();
  const documents = documentsQuery.data ?? [];

  return (
    <div>
      <PortalNav />
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-medium text-foreground">Documents</h2>
          <p className="text-sm text-muted-foreground">Files shared with you on your account.</p>
        </div>

        {documentsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-none" />
            ))}
          </div>
        ) : documentsQuery.isError ? (
          <ErrorState error={documentsQuery.error} />
        ) : documents.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" aria-hidden />} title="No documents shared yet" />
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="font-medium text-foreground">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/api/portal/documents/${doc.id}/download`} download>
                      <Download className="h-4 w-4" aria-hidden />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
