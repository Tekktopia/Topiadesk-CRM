'use client';

import * as React from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { humanize, macroActionTypeLabel } from '../../_lib/constants';
import { useCan, useDeleteMacro, useMacros } from '../../_lib/hooks';
import type { Macro } from '../../_lib/types';
import { MacroFormDialog } from './macro-form-dialog';

const UNCATEGORIZED_LABEL = 'Uncategorized';

interface MacroGroup {
  label: string;
  macros: Macro[];
}

/** Groups macros by their (free-text) `category`, with a trailing "Uncategorized" bucket for null/blank values — sections sorted alphabetically, rows within a section sorted by name. */
function groupMacrosByCategory(macros: Macro[]): MacroGroup[] {
  const byLabel = new Map<string, Macro[]>();
  for (const macro of macros) {
    const label = macro.category?.trim() || UNCATEGORIZED_LABEL;
    const group = byLabel.get(label) ?? [];
    group.push(macro);
    byLabel.set(label, group);
  }
  const labels = Array.from(byLabel.keys()).sort((a, b) => {
    if (a === UNCATEGORIZED_LABEL) return b === UNCATEGORIZED_LABEL ? 0 : 1;
    if (b === UNCATEGORIZED_LABEL) return -1;
    return a.localeCompare(b);
  });
  return labels.map((label) => ({
    label,
    macros: (byLabel.get(label) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function MacrosListView() {
  const { data, isLoading, isError } = useMacros();
  // Memoized against `data` specifically — see case-categories-list-view.tsx's
  // identical comment (hooks.ts's useDirectoryUsers explains the footgun).
  const macros = React.useMemo(() => data ?? [], [data]);
  // Button-gating only — real enforcement is macros.controller.ts's
  // @RequirePermission('macro', 'write') guard. Note macro:write is granted
  // at OWN scope broadly (macros_rw's RLS lets any authenticated user
  // create/apply their own macros — see macros.controller.ts's header
  // comment), so this is true for most roles, not just ADMIN.
  const canWrite = useCan('macro', 'write');
  const deleteMacro = useDeleteMacro();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Macro | null>(null);
  const [deleting, setDeleting] = React.useState<Macro | null>(null);

  const groups = React.useMemo(() => groupMacrosByCategory(macros), [macros]);
  const existingCategories = React.useMemo(
    () => Array.from(new Set(macros.map((m) => m.category?.trim()).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b)),
    [macros],
  );

  const columns = React.useMemo<ColumnDef<Macro>[]>(() => {
    const cols: ColumnDef<Macro>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        id: 'appliesTo',
        header: 'Applies to',
        meta: { label: 'Applies to' },
        accessorFn: (m) => (m.entityType ? humanize(m.entityType) : 'Claim & Case'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'actionsList',
        header: 'Actions',
        meta: { label: 'Actions' },
        enableSorting: false,
        accessorFn: (m) => m.actions.map((a) => macroActionTypeLabel(a.actionType)).join(', '),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'usageCount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Used" />,
        meta: { label: 'Used' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.usageCount}×</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Active" />,
        meta: { label: 'Active' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'outline'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
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
              <Button variant="ghost" size="icon" aria-label="Macro actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
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
        title="Macros"
        description="One-click action bundles agents apply to a claim or case (status change, reassignment, internal note, and more), grouped by category."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New macro
            </Button>
          ) : undefined
        }
      />

      {isLoading || isError ? (
        <DataTable<Macro, unknown> columns={columns} data={[]} isLoading={isLoading} isError={isError} />
      ) : macros.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No macros yet"
              description="Create one to let agents apply a bundle of actions in one click."
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden /> New macro
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {group.label}
                <span className="font-normal text-muted-foreground">({group.macros.length})</span>
              </h2>
              <DataTable<Macro, unknown> columns={columns} data={group.macros} getRowId={(m) => m.id} />
            </div>
          ))}
        </div>
      )}

      {canWrite && createOpen ? <MacroFormDialog open={createOpen} onOpenChange={setCreateOpen} existingCategories={existingCategories} /> : null}
      {canWrite && editing ? (
        <MacroFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} macro={editing} existingCategories={existingCategories} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the macro. This cannot be undone."
        confirmLabel="Delete macro"
        destructive
        isPending={deleteMacro.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteMacro.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
