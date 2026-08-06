'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import { Checkbox } from '../primitives/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { Skeleton } from '../primitives/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/table';

// Re-exported so consumers only need @topiadesk/ui, not a direct
// @tanstack/react-table dependency, to type their column defs and state.
export type { ColumnDef, OnChangeFn, PaginationState, Row, RowSelectionState, SortingState, VisibilityState };

/**
 * `packages/ui/src/composite/` — components built from >1 primitive that
 * encode a TopiaDesk-specific UX pattern. DataTable is the shared list-page
 * abstraction: every list page in the app was hand-rolling its own
 * <Table><TableHeader>… with zero column sorting and pagination on only 2
 * of ~28 pages, because there was nowhere shared to put either. This is
 * that shared place — headless (TanStack Table drives state; rendering
 * stays on our own Table/TableHead/TableRow primitives, so visuals don't
 * change) and supports both client-side state (the default: pass `data`,
 * get sorting/pagination for free) and server-driven state (pass
 * `manualSorting`/`manualPagination` + the matching state/onChange pair, for
 * pages backed by a paginated API endpoint).
 */
export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Stable row identity for selection state — defaults to row index, which
   * is wrong once data re-sorts/re-pages. Pass this whenever rows have a
   * real id (almost always). */
  getRowId?: (row: TData) => string;

  isLoading?: boolean;
  skeletonRows?: number;
  isError?: boolean;
  errorState?: React.ReactNode;
  emptyState?: React.ReactNode;

  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;

  /** Omit all three pagination props to render every row with no pager —
   * appropriate for small, bounded lists (e.g. macros, SLA policies). */
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  manualPagination?: boolean;
  /** Required when `manualPagination` — the server doesn't hand back every
   * row, so TanStack can't compute this itself. */
  pageCount?: number;
  /** Total row count across all pages, for the "N total" footer label under
   * manual pagination. Falls back to `data.length` when omitted. */
  totalRowCount?: number;

  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** Shows the "Columns" show/hide dropdown in the toolbar corner. Only
   * useful once at least one column sets `enableHiding: false` is NOT set
   * (all columns are hideable by default unless a column def opts out). */
  enableColumnVisibility?: boolean;

  onRowClick?: (row: TData) => void;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  isLoading,
  skeletonRows = 5,
  isError,
  errorState,
  emptyState,
  sorting,
  onSortingChange,
  manualSorting = false,
  pagination,
  onPaginationChange,
  manualPagination = false,
  pageCount,
  totalRowCount,
  rowSelection,
  onRowSelectionChange,
  columnVisibility,
  onColumnVisibilityChange,
  enableColumnVisibility = false,
  onRowClick,
  className,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const [internalColumnVisibility, setInternalColumnVisibility] = React.useState<VisibilityState>({});
  // Same fallback pattern as sorting/columnVisibility above — easy to miss
  // because it doesn't break the *caller's* types (rowSelection is already
  // optional), it breaks every row's `row.getIsSelected()` at runtime: once
  // any key is present in TanStack's `state` object it's treated as
  // controlled, so an omitted `rowSelection` becomes literal `undefined`
  // rather than TanStack's own internal default, and its row-selection
  // helpers index into it unguarded (`selection[row.id]`) and throw. Every
  // page that doesn't need row selection (i.e. most list pages) hit this.
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    state: {
      sorting: sorting ?? internalSorting,
      pagination,
      rowSelection: rowSelection ?? internalRowSelection,
      columnVisibility: columnVisibility ?? internalColumnVisibility,
    },
    onSortingChange: onSortingChange ?? setInternalSorting,
    onPaginationChange,
    onRowSelectionChange: onRowSelectionChange ?? setInternalRowSelection,
    onColumnVisibilityChange: onColumnVisibilityChange ?? setInternalColumnVisibility,
    manualSorting,
    manualPagination,
    pageCount: manualPagination ? pageCount : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getPaginationRowModel: pagination && !manualPagination ? getPaginationRowModel() : undefined,
  });

  const showPager = !!pagination;
  const rows = table.getRowModel().rows;

  return (
    <div className={cn('space-y-3', className)}>
      {enableColumnVisibility ? (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-3.5 w-3.5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {typeof column.columnDef.meta === 'object' &&
                    column.columnDef.meta &&
                    'label' in column.columnDef.meta
                      ? String((column.columnDef.meta as { label?: string }).label)
                      : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-none bg-card shadow-brand-md">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_, colIndex) => (
                    <TableCell key={colIndex}>
                      <Skeleton className="h-5 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center">
                  {errorState ?? <span className="text-sm text-destructive">Failed to load data.</span>}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center">
                  {emptyState ?? <span className="text-sm text-muted-foreground">No records found.</span>}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} onClick={cell.column.id === 'select' ? (e) => e.stopPropagation() : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showPager && !isLoading && !isError ? (
        <DataTablePager
          pageIndex={table.getState().pagination.pageIndex}
          pageCount={manualPagination ? (pageCount ?? 0) : table.getPageCount()}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          onPrevious={() => table.previousPage()}
          onNext={() => table.nextPage()}
          totalRowCount={totalRowCount ?? data.length}
        />
      ) : null}
    </div>
  );
}

function DataTablePager({
  pageIndex,
  pageCount,
  canPreviousPage,
  canNextPage,
  onPrevious,
  onNext,
  totalRowCount,
}: {
  pageIndex: number;
  pageCount: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
  totalRowCount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>{totalRowCount.toLocaleString()} total</span>
      <div className="flex items-center gap-2">
        <span>
          Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
        </span>
        <Button variant="outline" size="icon" disabled={!canPreviousPage} onClick={onPrevious} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" disabled={!canNextPage} onClick={onNext} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Drop-in sortable column header — use as a column def's `header`:
 *   { accessorKey: 'name', header: ({ column }) => <DataTableColumnHeader column={column} label="Name" /> }
 * No-ops (renders a plain label) when the column has sorting disabled. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  label,
  className,
}: {
  column: { getCanSort: () => boolean; getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void };
  label: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <span className={className}>{label}</span>;
  }
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className={cn('flex items-center gap-1 hover:text-foreground', className)}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
      )}
    </button>
  );
}

/** Checkbox select-column factory — replaces the hand-rolled
 * `<input type="checkbox">` pattern previously copy-pasted across accounts,
 * leads, and opportunities. Spread into a column defs array:
 *   columns={[selectionColumn<Account>(), ...otherColumns]}
 * Requires `getRowId` on <DataTable> so selection survives sort/page changes. */
export function selectionColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Select row" />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
  };
}
