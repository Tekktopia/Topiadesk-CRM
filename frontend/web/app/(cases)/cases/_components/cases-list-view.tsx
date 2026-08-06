'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';
import { Badge, Button, Card, CardContent, type ColumnDef, DataTable, DataTableColumnHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@topiadesk/ui';
import { useQuickCreateParam } from '@/lib/use-quick-create-param';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SlaBadge } from '../../_components/sla-badge';
import { caseTypeLabel, casePriorityLabel, casePriorityVariant } from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import { useCasesQueue, useSelfAssignCase, useSlaClocksByPolicyIds } from '../../_lib/hooks';
import type { Case } from '../../_lib/types';
import { CaseFormDialog } from './case-form-dialog';
import { TicketWorkspace } from './ticket-workspace';

export function CasesListView() {
  const [createOpen, setCreateOpen] = React.useState(false);
  useQuickCreateParam(() => setCreateOpen(true));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Enquiries, service requests, and complaints."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New ticket
          </Button>
        }
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All tickets</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <TicketWorkspace />
        </TabsContent>
        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
      </Tabs>

      <CaseFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function QueueTab() {
  const { data, isLoading, isFetching, isError } = useCasesQueue();
  const selfAssign = useSelfAssignCase();
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const cases = data ?? [];
  const { clocksByEntityId } = useSlaClocksByPolicyIds(cases.map((c) => c.slaPolicyId));

  const columns = React.useMemo<ColumnDef<Case>[]>(
    () => [
      {
        accessorKey: 'caseNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Ticket #" />,
        meta: { label: 'Ticket #' },
        cell: ({ row }) => (
          <Link href={`/cases/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.caseNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'subject',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Subject" />,
        meta: { label: 'Subject' },
        cell: ({ row }) => <span className="block max-w-[220px] truncate text-muted-foreground">{row.original.subject}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        accessorFn: (c) => caseTypeLabel(c.caseType),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Priority" />,
        meta: { label: 'Priority' },
        cell: ({ row }) => <Badge variant={casePriorityVariant(row.original.priority)}>{casePriorityLabel(row.original.priority)}</Badge>,
      },
      {
        id: 'sla',
        header: 'SLA',
        meta: { label: 'SLA' },
        enableSorting: false,
        cell: ({ row }) => <SlaBadge clocks={clocksByEntityId.get(row.original.id)} />,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        meta: { label: 'Created' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <Button size="sm" variant="outline" disabled={selfAssign.isPending} onClick={() => selfAssign.mutate(row.original.id)}>
            Claim
          </Button>
        ),
      },
    ],
    [clocksByEntityId, selfAssign],
  );

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Unassigned, still-active cases (NEW/OPEN/REOPENED) ordered by priority — pick one up with &quot;Claim&quot;.
          </p>
        </CardContent>
      </Card>

      {isFetching && !isLoading ? (
        <div className="flex justify-end">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : null}

      {!isLoading && !isError && cases.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title="Queue is empty" description="Every active ticket is already assigned." />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Case, unknown>
          columns={columns}
          data={cases}
          getRowId={(c) => c.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={cases.length}
        />
      )}
    </div>
  );
}
