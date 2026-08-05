'use client';

import * as React from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  type ColumnDef,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { buildCategoryTree, categoryLabel, type CategoryTreeRow } from '../../_lib/category-tree';
import { useCan, useDeleteLossCauseCategory, useLossCauseCategories } from '../../_lib/hooks';
import type { LossCauseCategory } from '../../_lib/types';
import { LossCauseCategoryFormDialog } from './loss-cause-category-form-dialog';

/**
 * Loss cause category CRUD — admin/config tier (see
 * loss-cause-categories.controller.ts's header comment: writes gated on
 * 'claim':'write', reads ungated open lookup data). Mirrors sla-policies/
 * macros' list+dialog shape.
 *
 * Renders as an indented tree (depth-first, parent-before-children —
 * buildCategoryTree in _lib/category-tree.ts) rather than a flat list, now
 * that LossCauseCategory carries a self-relation `parentId`. Same
 * client-side-flat-list-to-tree convention as case-categories-list-view.tsx
 * and app/(knowledge)/_lib/category-tree.ts's KnowledgeCategory tree.
 */
export function LossCauseCategoriesListView() {
  const { data, isLoading, isError } = useLossCauseCategories();
  // Memoized against `data` specifically — see case-categories-list-view.tsx's
  // identical comment (hooks.ts's useDirectoryUsers explains the footgun).
  const categories = React.useMemo(() => data ?? [], [data]);
  // Button-gating only — real enforcement is
  // loss-cause-categories.controller.ts's @RequirePermission('claim',
  // 'write') guard (reads are ungated open lookup data).
  const canWrite = useCan('claim', 'write');
  const deleteCategory = useDeleteLossCauseCategory();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LossCauseCategory | null>(null);
  const [deleting, setDeleting] = React.useState<LossCauseCategory | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const rows = React.useMemo(() => buildCategoryTree(categories), [categories]);

  // Sorting disabled on every column — see case-categories-list-view.tsx's
  // identical comment (a sort would break the tree's parent-before-children
  // ordering that indentation depends on).
  const columns = React.useMemo<ColumnDef<CategoryTreeRow<LossCauseCategory>>[]>(() => {
    const cols: ColumnDef<CategoryTreeRow<LossCauseCategory>>[] = [
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
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue<string>()}</span>,
      },
    ];
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Category actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original.category)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original.category)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }
    return cols;
  }, [canWrite]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loss Cause Categories"
        description="Standardized causes of loss (fire, flood, theft, and more) selectable when reporting a claim. Nest a category by setting a parent."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New category
            </Button>
          ) : undefined
        }
      />

      {!isLoading && !isError && categories.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No loss cause categories yet"
              description="Create one to standardize how claims record their cause of loss."
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden /> New category
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<CategoryTreeRow<LossCauseCategory>, unknown>
          columns={columns}
          data={rows}
          getRowId={(r) => r.category.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={rows.length}
        />
      )}

      {canWrite && createOpen ? <LossCauseCategoryFormDialog open={createOpen} onOpenChange={setCreateOpen} allCategories={categories} /> : null}
      {canWrite && editing ? (
        <LossCauseCategoryFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} category={editing} allCategories={categories} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the loss cause category. This cannot be undone — deletion is blocked if any claim still references it. Sub-categories are not moved automatically."
        confirmLabel="Delete category"
        destructive
        isPending={deleteCategory.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteCategory.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
