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
import { summarizeWeeklyHours } from '../../_lib/constants';
import { useBusinessHoursCalendars, useCan, useDeleteBusinessHoursCalendar } from '../../_lib/hooks';
import type { BusinessHoursCalendar } from '../../_lib/types';
import { BusinessHoursCalendarFormDialog } from './business-hours-calendar-form-dialog';

/** Business hours calendar CRUD — admin/config tier (see business-hours.controller.ts's header comment: same 'sla_config' tier as sla-policies.controller.ts). Mirrors sla-policies/macros' list+dialog shape; holiday management lives inside the edit dialog (see business-hours-calendar-form-dialog.tsx's header comment). */
export function BusinessHoursListView() {
  const { data, isLoading, isError } = useBusinessHoursCalendars();
  const calendars = data ?? [];
  // Button-gating only — real enforcement is business-hours.controller.ts's
  // @RequirePermission('sla_config', 'write') guard. See hooks.ts's
  // useCan() header comment for why 'sla_config' (not a per-page resource).
  const canWrite = useCan('sla_config', 'write');
  const deleteCalendar = useDeleteBusinessHoursCalendar();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BusinessHoursCalendar | null>(null);
  const [deleting, setDeleting] = React.useState<BusinessHoursCalendar | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<BusinessHoursCalendar>[]>(() => {
    const cols: ColumnDef<BusinessHoursCalendar>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'timezone',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Timezone" />,
        meta: { label: 'Timezone' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.timezone}</span>,
      },
      {
        id: 'hours',
        header: 'Weekly hours',
        meta: { label: 'Weekly hours' },
        enableSorting: false,
        accessorFn: (c) => summarizeWeeklyHours(c.weeklyHours),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'isDefault',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Default" />,
        meta: { label: 'Default' },
        cell: ({ row }) => <Badge variant={row.original.isDefault ? 'success' : 'outline'}>{row.original.isDefault ? 'Default' : '—'}</Badge>,
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
              <Button variant="ghost" size="icon" aria-label="Calendar actions">
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
        title="Business Hours"
        description="Open-hours calendars the SLA engine uses to compute due dates — attach one to an SLA policy to pause the clock outside working hours and on holidays."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New calendar
            </Button>
          ) : undefined
        }
      />

      {!isLoading && !isError && calendars.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No business hours calendars yet"
              description="Create one to attach to an SLA policy — without one, SLA clocks run 24/7."
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden /> New calendar
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<BusinessHoursCalendar, unknown>
          columns={columns}
          data={calendars}
          getRowId={(c) => c.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={calendars.length}
        />
      )}

      {canWrite && createOpen ? <BusinessHoursCalendarFormDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
      {canWrite && editing ? (
        <BusinessHoursCalendarFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} calendar={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the calendar and its holidays. This cannot be undone — deletion is blocked if any SLA policy still references it."
        confirmLabel="Delete calendar"
        destructive
        isPending={deleteCalendar.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteCalendar.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
