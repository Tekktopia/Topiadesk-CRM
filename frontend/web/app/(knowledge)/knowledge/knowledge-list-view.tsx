'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FolderTree, Loader2, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { buildCategoryTree, categoryLabel } from '../_lib/category-tree';
import { ARTICLE_STATUSES, ARTICLE_VISIBILITIES, articleStatusLabel, articleStatusVariant, visibilityLabel, visibilityVariant } from '../_lib/constants';
import { formatDate } from '../_lib/format';
import { useKnowledgeArticles, useKnowledgeCategories } from '../_lib/queries';
import { useDebouncedValue } from '../_lib/use-debounced-value';
import type { KnowledgeArticle, KnowledgeArticleQuery } from '../_lib/types';

const UNSET = '__any';

// Stable empty object — passed to DataTable's `rowSelection` prop even
// though this page has no selection UI. Workaround for a bug in
// packages/ui/src/composite/data-table.tsx: when `rowSelection` is omitted,
// its `state.rowSelection` ends up `undefined` (TanStack's useReactTable
// spreads `options.state` over internal state, and an explicit `undefined`
// key wins), and TanStack's `isRowSelected` does `selection[row.id]`
// unguarded — crashing every real (non-skeleton) row with "Cannot read
// properties of undefined (reading '<row id>')". Passing a stable `{}`
// keeps `state.rowSelection` defined without rendering any selection UI.
const EMPTY_ROW_SELECTION: RowSelectionState = {};

export function KnowledgeListView() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(UNSET);
  const [categoryId, setCategoryId] = useState<string>(UNSET);
  const [visibility, setVisibility] = useState<string>(UNSET);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debouncedSearch = useDebouncedValue(search, 300);

  const categoriesQuery = useKnowledgeCategories();
  const categoryRows = useMemo(() => buildCategoryTree(categoriesQuery.data ?? []), [categoriesQuery.data]);
  const categoryNameById = useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);

  const query: KnowledgeArticleQuery = {
    q: debouncedSearch || undefined,
    status: status === UNSET ? undefined : (status as KnowledgeArticleQuery['status']),
    categoryId: categoryId === UNSET ? undefined : categoryId,
    visibility: visibility === UNSET ? undefined : (visibility as KnowledgeArticleQuery['visibility']),
  };
  const articlesQuery = useKnowledgeArticles(query);
  const data = articlesQuery.data ?? [];

  const columns = useMemo<ColumnDef<KnowledgeArticle>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Title" />,
        meta: { label: 'Title' },
        cell: ({ row }) => (
          <Link href={`/knowledge/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        meta: { label: 'Category' },
        accessorFn: (a) => (a.categoryId ? (categoryNameById.get(a.categoryId) ?? '—') : '—'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={articleStatusVariant(row.original.status)}>{articleStatusLabel(row.original.status)}</Badge>,
      },
      {
        accessorKey: 'visibility',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Visibility" />,
        meta: { label: 'Visibility' },
        cell: ({ row }) => <Badge variant={visibilityVariant(row.original.visibility)}>{visibilityLabel(row.original.visibility)}</Badge>,
      },
      {
        id: 'helpful',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Helpful" className="justify-end" />,
        meta: { label: 'Helpful' },
        accessorFn: (a) => a.helpfulCount,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums text-muted-foreground">
            {row.original.helpfulCount} / {row.original.helpfulCount + row.original.notHelpfulCount}
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Updated" />,
        meta: { label: 'Updated' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.updatedAt).getTime() - new Date(b.original.updatedAt).getTime(),
      },
    ],
    [categoryNameById],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        description="Internal articles — draft, submit for review, and publish through the standard Approval flow."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/knowledge/categories">
                <FolderTree className="h-4 w-4" aria-hidden /> Categories
              </Link>
            </Button>
            <Button asChild>
              <Link href="/knowledge/new">
                <Plus className="h-4 w-4" aria-hidden /> New article
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="article-search">
              Search
            </label>
            <Input id="article-search" placeholder="Search by title…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {ARTICLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {articleStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-56">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All categories</SelectItem>
                {categoryRows.map((row) => (
                  <SelectItem key={row.category.id} value={row.category.id}>
                    {categoryLabel(row)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Visibility</label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any visibility</SelectItem>
                {ARTICLE_VISIBILITIES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {visibilityLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!articlesQuery.isLoading && !articlesQuery.isError && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No articles match these filters"
              description="Try clearing a filter, or create a new article to get started."
              action={
                <Button variant="outline" asChild>
                  <Link href="/knowledge/new">
                    <Plus className="h-4 w-4" aria-hidden /> New article
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              {articlesQuery.isFetching ? (
                <Loader2 className="absolute right-0 top-0 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
              <DataTable<KnowledgeArticle, unknown>
                columns={columns}
                data={data}
                getRowId={(a) => a.id}
                rowSelection={EMPTY_ROW_SELECTION}
                isLoading={articlesQuery.isLoading}
                isError={articlesQuery.isError}
                errorState={<ErrorState error={articlesQuery.error} />}
                pagination={pagination}
                onPaginationChange={setPagination}
                totalRowCount={data.length}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
