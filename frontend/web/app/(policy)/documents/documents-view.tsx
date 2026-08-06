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
  selectionColumn,
  toast,
} from '@topiadesk/ui';
import { Archive, Download, FileText, FolderOpen, FolderInput } from 'lucide-react';
import { formatDate } from '@/app/(policy)/lib/format';
import type { DocumentCategoryDto, DocumentDto } from '@/app/(policy)/lib/types';
import { useDebouncedValue } from '@/app/(policy)/lib/use-debounced-value';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { SelectionToolbar } from '../_components/selection-toolbar';
import { UploadDocumentDialog } from './upload-document-dialog';
import { AddVersionDialog } from './add-version-dialog';
import { LinkToPolicyDialog } from './link-to-policy-dialog';
import { CategorizeDialog } from './categorize-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface BulkActionResult {
  requested: string[];
  updated: string[];
  skipped: string[];
}

async function postBulk(url: string, body: unknown): Promise<BulkActionResult> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  const parsed = (await res.json().catch(() => null)) as (BulkActionResult & { message?: string }) | null;
  if (!res.ok) throw new Error(parsed?.message ?? `${url} failed: ${res.status}`);
  if (!parsed) throw new Error(`${url} returned no body`);
  return parsed;
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
  const debouncedSearch = useDebouncedValue(search);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [categorizeOpen, setCategorizeOpen] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [categorizing, setCategorizing] = React.useState(false);

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  const categoriesQuery = useQuery({
    queryKey: ['document-categories'],
    queryFn: () => fetchJson<DocumentCategoryDto[]>('/api/documents/categories'),
    staleTime: 5 * 60_000,
  });
  // Server-side search on fileName (DocumentsController.list's `search`
  // param) — replaces the old client-only filter now that a real search
  // endpoint exists.
  const documentsQuery = useQuery({
    queryKey: ['documents', categoryId, debouncedSearch],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (categoryId !== ALL) qs.set('categoryId', categoryId);
      if (debouncedSearch) qs.set('search', debouncedSearch);
      const query = qs.toString();
      return fetchJson<DocumentDto[]>(`/api/documents${query ? `?${query}` : ''}`);
    },
  });

  const categoryNameById = React.useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])),
    [categoriesQuery.data],
  );

  const visibleDocuments = documentsQuery.data ?? [];

  async function archiveSelected() {
    setArchiving(true);
    try {
      const result = await postBulk('/api/documents/bulk/archive', { ids: selectedIds });
      if (result.updated.length > 0) toast.success(`Archived ${result.updated.length} ${result.updated.length === 1 ? 'document' : 'documents'}.`);
      if (result.skipped.length > 0) toast.error(`${result.skipped.length} ${result.skipped.length === 1 ? 'document was' : 'documents were'} skipped (outside scope).`);
      setRowSelection({});
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive documents');
    } finally {
      setArchiving(false);
    }
  }

  async function categorizeSelected(categoryIdToSet: string) {
    setCategorizing(true);
    try {
      const result = await postBulk('/api/documents/bulk/categorize', { ids: selectedIds, categoryId: categoryIdToSet });
      if (result.updated.length > 0) toast.success(`Moved ${result.updated.length} ${result.updated.length === 1 ? 'document' : 'documents'}.`);
      if (result.skipped.length > 0) toast.error(`${result.skipped.length} ${result.skipped.length === 1 ? 'document was' : 'documents were'} skipped (outside scope).`);
      setRowSelection({});
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move documents');
    } finally {
      setCategorizing(false);
    }
  }

  const invalidate = React.useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['documents'] }),
    [queryClient],
  );

  const columns = React.useMemo<ColumnDef<DocumentDto>[]>(
    () => [
      selectionColumn<DocumentDto>(),
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

      <SelectionToolbar selectedCount={selectedIds.length} onClearSelection={() => setRowSelection({})}>
        <Button type="button" variant="outline" size="sm" onClick={() => setCategorizeOpen(true)}>
          <FolderInput className="h-4 w-4" aria-hidden /> Move to category
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
          <Archive className="h-4 w-4" aria-hidden /> Archive
        </Button>
      </SelectionToolbar>

      <DataTable<DocumentDto, unknown>
        columns={columns}
        data={visibleDocuments}
        getRowId={(doc) => doc.id}
        isLoading={documentsQuery.isLoading}
        isError={documentsQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load documents.</span>}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
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

      <CategorizeDialog
        open={categorizeOpen}
        onOpenChange={setCategorizeOpen}
        categories={categoriesQuery.data ?? []}
        isPending={categorizing}
        onConfirm={(categoryIdToSet) => {
          setCategorizeOpen(false);
          void categorizeSelected(categoryIdToSet);
        }}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${selectedIds.length} ${selectedIds.length === 1 ? 'document' : 'documents'}?`}
        description="Archived documents stay on file but are flagged for retention review — this doesn't delete anything."
        confirmLabel="Archive"
        isPending={archiving}
        onConfirm={() => {
          setArchiveOpen(false);
          void archiveSelected();
        }}
      />
    </div>
  );
}
