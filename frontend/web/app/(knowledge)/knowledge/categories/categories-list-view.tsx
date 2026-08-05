'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, type ColumnDef, DataTable, type RowSelectionState } from '@topiadesk/ui';
import { PageHeader } from '../../_components/page-header';
import { ErrorState } from '../../_components/query-states';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { buildCategoryTree, categoryLabel, type CategoryTreeRow } from '../../_lib/category-tree';
import { useDeleteKnowledgeCategory, useKnowledgeCategories } from '../../_lib/queries';
import type { KnowledgeCategory } from '../../_lib/types';
import { CategoryFormDialog } from './category-form-dialog';

// Stable empty object — see EMPTY_ROW_SELECTION comment in
// app/(knowledge)/knowledge/knowledge-list-view.tsx. Workaround for a
// data-table.tsx bug where an omitted `rowSelection` prop crashes every
// real row via TanStack's unguarded `selection[row.id]`.
const EMPTY_ROW_SELECTION: RowSelectionState = {};

export function CategoriesListView() {
  const categoriesQuery = useKnowledgeCategories();
  const [formTarget, setFormTarget] = useState<'create' | KnowledgeCategory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KnowledgeCategory | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const deleteMutation = useDeleteKnowledgeCategory();

  const rows = useMemo(() => buildCategoryTree(categoriesQuery.data ?? []), [categoriesQuery.data]);

  // Sorting is intentionally disabled on this table: rows are a depth-first
  // parent-before-children walk (buildCategoryTree) with indentation
  // encoding the hierarchy. A generic column sort would re-flatten rows by
  // raw name/code/order and break that parent/child grouping, so this page
  // keeps DataTable for pagination/visual consistency but opts every column
  // out of sorting rather than offering a control that corrupts the tree.
  const columns = useMemo<ColumnDef<CategoryTreeRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        meta: { label: 'Name' },
        enableSorting: false,
        accessorFn: (row) => row.category.name,
        cell: ({ row }) => <span className="font-medium text-foreground">{categoryLabel(row.original)}</span>,
      },
      {
        id: 'code',
        header: 'Code',
        meta: { label: 'Code' },
        enableSorting: false,
        accessorFn: (row) => row.category.code,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'order',
        header: 'Order',
        meta: { label: 'Order' },
        enableSorting: false,
        accessorFn: (row) => row.category.order,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<number>()}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${row.original.category.name}`}
              onClick={() => setFormTarget(row.original.category)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.original.category.name}`}
              onClick={() => setPendingDelete(row.original.category)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge categories"
        description="Category tree used to organize Knowledge Base articles — nest a category by setting a parent."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/knowledge">
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back to articles
              </Link>
            </Button>
            <Button onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" aria-hidden /> New category
            </Button>
          </div>
        }
      />

      <DataTable<CategoryTreeRow, unknown>
        columns={columns}
        data={rows}
        getRowId={(r) => r.category.id}
        rowSelection={EMPTY_ROW_SELECTION}
        isLoading={categoriesQuery.isLoading}
        isError={categoriesQuery.isError}
        errorState={<ErrorState error={categoriesQuery.error} />}
        emptyState={
          <div className="py-4">
            <p className="text-sm font-medium text-foreground">No categories yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create a category to start organizing Knowledge Base articles.</p>
            <Button variant="outline" className="mt-4" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" aria-hidden /> New category
            </Button>
          </div>
        }
        pagination={pagination}
        onPaginationChange={setPagination}
        totalRowCount={rows.length}
      />

      {formTarget ? (
        <CategoryFormDialog
          target={formTarget}
          allCategories={categoriesQuery.data ?? []}
          open={Boolean(formTarget)}
          onOpenChange={(open) => !open && setFormTarget(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete "${pendingDelete.name}"?`}
          description="Articles filed under this category keep their reference, but the category will no longer be selectable. Sub-categories are not moved automatically."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })}
        />
      ) : null}
    </div>
  );
}
