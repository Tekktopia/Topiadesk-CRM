'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@topiadesk/ui';
import { Download, FileText, FolderOpen } from 'lucide-react';
import { formatDate } from '@/app/(policy)/lib/format';
import type { DocumentCategoryDto, DocumentDto } from '@/app/(policy)/lib/types';
import { UploadDocumentDialog } from './upload-document-dialog';
import { AddVersionDialog } from './add-version-dialog';
import { LinkToPolicyDialog } from './link-to-policy-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALL = 'ALL';

/**
 * Document manager — upload/version/download/link, per the build brief's
 * "keep it simple" guidance: a functional list + upload dialog, not a
 * full DMS. Backed by GET /documents (app/api/documents), with per-row
 * "add version" and "link to policy" actions.
 */
export function DocumentsView() {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = React.useState(ALL);

  const categoriesQuery = useQuery({
    queryKey: ['document-categories'],
    queryFn: () => fetchJson<DocumentCategoryDto[]>('/api/documents/categories'),
    staleTime: 5 * 60_000,
  });
  const documentsQuery = useQuery({
    queryKey: ['documents', categoryId],
    queryFn: () => fetchJson<DocumentDto[]>(`/api/documents${categoryId !== ALL ? `?categoryId=${categoryId}` : ''}`),
  });

  const categoryNameById = React.useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])),
    [categoriesQuery.data],
  );

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['documents'] });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground">Policy schedules, endorsements, correspondence, and every other file on file.</p>
        </div>
        <UploadDocumentDialog onUploaded={invalidate} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {(categoriesQuery.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : documentsQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Couldn&apos;t load documents.</p>
          ) : !documentsQuery.data || documentsQuery.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentsQuery.data.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                        {doc.fileName}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.categoryId ? (categoryNameById.get(doc.categoryId) ?? '—') : 'Uncategorized'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatBytes(doc.sizeBytes)}</TableCell>
                    <TableCell className="text-muted-foreground">v{doc.currentVersion?.versionNumber ?? 1}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(doc.createdAt)}</TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" asChild title="Download">
                        <a href={`/api/documents/${doc.id}/download`} download>
                          <Download className="h-4 w-4" aria-hidden />
                        </a>
                      </Button>
                      <AddVersionDialog documentId={doc.id} fileName={doc.fileName} onAdded={invalidate} />
                      <LinkToPolicyDialog documentId={doc.id} fileName={doc.fileName} onLinked={invalidate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
