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
import { caseTypeLabel } from '../../_lib/constants';
import { useCaseCategories, useCan, useDeleteCaseCategory } from '../../_lib/hooks';
import type { CaseCategory } from '../../_lib/types';
import { CaseCategoryFormDialog } from './case-category-form-dialog';

/**
 * Case category CRUD — admin/config tier (see case-categories.controller.ts's
 * header comment: writes gated on 'case':'write', reads ungated open lookup
 * data). Mirrors sla-policies/macros' list+dialog shape.
 *
 * Renders as an indented tree (depth-first, parent-before-children —
 * buildCategoryTree in _lib/category-tree.ts) rather than a flat list, now
 * that CaseCategory carries a self-relation `parentId`. The backend keeps
 * list responses flat by design (no nested-tree endpoint — same convention
 * as app/(knowledge)/_lib/category-tree.ts's KnowledgeCategory tree), so
 * the walk happens client-side from the full flat list.
 */
export function CaseCategoriesListView() {
  const { data, isLoading, isError } = useCaseCategories();
  // Memoized against `data` specifically (not recomputed as a fresh `[]`
  // literal every render while loading) — see hooks.ts's useDirectoryUsers
  // header comment for why an unstable reference here is a real footgun for
  // the buildCategoryTree useMemo below.
  const categories = React.useMemo(() => data ?? [], [data]);
  // Button-gating only — real enforcement is case-categories.controller.ts's
  // @RequirePermission('case', 'write') guard (reads are ungated open lookup
  // data, so no read-side check is needed to view this page).
  const canWrite = useCan('case', 'write');
  const deleteCategory = useDeleteCaseCategory();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CaseCategory | null>(null);
  const [deleting, setDeleting] = React.useState<CaseCategory | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const rows = React.useMemo(() => buildCategoryTree(categories), [categories]);

  // Sorting is intentionally disabled on every column: rows are a
  // depth-first parent-before-children walk with indentation encoding the
  // hierarchy (see buildCategoryTree) — a column sort would re-flatten rows
  // by raw name/code/case-type and break that grouping. Same convention as
  // app/(knowledge)/knowledge/categories/categories-list-view.tsx.
  const columns = React.useMemo<ColumnDef<CategoryTreeRow<CaseCategory>>[]>(() => {
    const cols: ColumnDef<CategoryTreeRow<CaseCategory>>[] = [
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
      {
        id: 'caseType',
        header: 'Ticket type',
        meta: { label: 'Ticket type' },
        enableSorting: false,
        accessorFn: (row) => (row.category.caseType ? caseTypeLabel(row.category.caseType) : 'Any'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
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
        title="Ticket Categories"
        description="Categorizes enquiries, service requests, and complaints — optionally restricted to one ticket type. Nest a category by setting a parent."
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
              title="No ticket categories yet"
              description="Create one to categorize how tickets get triaged."
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
        <DataTable<CategoryTreeRow<CaseCategory>, unknown>
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

      {canWrite && createOpen ? <CaseCategoryFormDialog open={createOpen} onOpenChange={setCreateOpen} allCategories={categories} /> : null}
      {canWrite && editing ? (
        <CaseCategoryFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} category={editing} allCategories={categories} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the ticket category. This cannot be undone — deletion is blocked if any ticket still references it. Sub-categories are not moved automatically."
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
