'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Input,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  const [search, setSearch] = React.useState('');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // Workaround for a bug in @topiadesk/ui's DataTable — see the matching
  // comment in policies-view.tsx: omitting `rowSelection` entirely (this
  // page has no bulk actions) crashes row rendering because the component's
  // internal state has no fallback for it. A stable empty object avoids
  // that without adding any selection UI.
  const [rowSelection] = React.useState<RowSelectionState>({});

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

  // Client-side filter over the already-fetched (category-scoped) list — no
  // server-side search endpoint exists, and adding one is out of scope here.
  const visibleDocuments = React.useMemo(() => {
    const rows = documentsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((doc) => doc.fileName.toLowerCase().includes(q));
  }, [documentsQuery.data, search]);

  const invalidate = React.useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['documents'] }),
    [queryClient],
  );

  const columns = React.useMemo<ColumnDef<DocumentDto>[]>(
    () => [
      {
        accessorKey: 'fileName',
        header: ({ column }) => <DataTableColumnHeader column={column} label="File" />,
        meta: { label: 'File' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium text-foreground">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
            {row.original.fileName}
          </span>
        ),
      },
      {
        id: 'category',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Category" />,
        meta: { label: 'Category' },
        accessorFn: (doc) => (doc.categoryId ? (categoryNameById.get(doc.categoryId) ?? '—') : 'Uncategorized'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'sizeBytes',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Size" />,
        meta: { label: 'Size' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatBytes(row.original.sizeBytes)}</span>,
      },
      {
        id: 'version',
        header: 'Version',
        meta: { label: 'Version' },
        accessorFn: (doc) => doc.currentVersion?.versionNumber ?? 1,
        cell: ({ getValue }) => <span className="text-muted-foreground">v{getValue<number>()}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Uploaded" />,
        meta: { label: 'Uploaded' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" asChild title="Download">
              <a href={`/api/documents/${row.original.id}/download`} download>
                <Download className="h-4 w-4" aria-hidden />
              </a>
            </Button>
            <AddVersionDialog documentId={row.original.id} fileName={row.original.fileName} onAdded={invalidate} />
            <LinkToPolicyDialog documentId={row.original.id} fileName={row.original.fileName} onLinked={invalidate} />
          </div>
        ),
      },
    ],
    [categoryNameById, invalidate],
  );

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
        <Input
          placeholder="Search file name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="w-64"
        />
        <Select
          value={categoryId}
          onValueChange={(value) => {
            setCategoryId(value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        >
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

      <DataTable<DocumentDto, unknown>
        columns={columns}
        data={visibleDocuments}
        getRowId={(doc) => doc.id}
        isLoading={documentsQuery.isLoading}
        isError={documentsQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load documents.</span>}
        rowSelection={rowSelection}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
            <span className="text-sm text-muted-foreground">No documents yet.</span>
          </div>
        }
        enableColumnVisibility
      />
    </div>
  );
}
