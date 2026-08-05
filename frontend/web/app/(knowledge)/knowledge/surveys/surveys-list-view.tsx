'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus } from 'lucide-react';
import { Badge, Button, type ColumnDef, DataTable, DataTableColumnHeader, type RowSelectionState } from '@topiadesk/ui';
import { PageHeader } from '../../_components/page-header';
import { ErrorState } from '../../_components/query-states';
import { SURVEY_TRIGGER_EVENT_LABEL, SURVEY_TYPE_LABEL } from '../../_lib/constants';
import { useSurveys } from '../../_lib/queries';
import type { Survey } from '../../_lib/types';
import { SurveyFormDialog } from './survey-form-dialog';

/** Survey definitions (CSAT/NPS/CES) — an ALL-scope-only resource
 * (`surveys_rw`'s WITH CHECK, seed.ts's comment on the COMPLIANCE_OFFICER
 * grant): front-line brokers can read/respond-report but only
 * COMPLIANCE_OFFICER/ADMIN can create or edit a survey, matching CRM/QA
 * program ownership sitting with compliance oversight in this org. A
 * caller without survey:write still sees this list (survey:read is
 * broader) but the "New survey"/edit affordances will 403 if used — same
 * "UX-only visibility gating, backend is the real enforcement" pattern as
 * app/(admin)/admin/_lib/permissions.ts. */

// Stable empty object — see EMPTY_ROW_SELECTION comment in
// app/(knowledge)/knowledge/knowledge-list-view.tsx. Workaround for a
// data-table.tsx bug where an omitted `rowSelection` prop crashes every
// real row via TanStack's unguarded `selection[row.id]`.
const EMPTY_ROW_SELECTION: RowSelectionState = {};

export function SurveysListView() {
  const surveysQuery = useSurveys();
  const [formTarget, setFormTarget] = useState<'create' | Survey | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const data = surveysQuery.data ?? [];

  const columns = useMemo<ColumnDef<Survey>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => (
          <Link href={`/knowledge/surveys/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Type" />,
        meta: { label: 'Type' },
        cell: ({ row }) => <span className="text-muted-foreground">{SURVEY_TYPE_LABEL[row.original.type]}</span>,
      },
      {
        accessorKey: 'triggerEvent',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Trigger" />,
        meta: { label: 'Trigger' },
        cell: ({ row }) => <span className="text-muted-foreground">{SURVEY_TRIGGER_EVENT_LABEL[row.original.triggerEvent]}</span>,
      },
      {
        id: 'scale',
        header: 'Scale',
        meta: { label: 'Scale' },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.scaleMin}–{row.original.scaleMax}
          </span>
        ),
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.name}`} onClick={() => setFormTarget(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Surveys"
        description="CSAT / NPS / CES survey definitions. Responses are collected via a public, token-verified link sent to the customer."
        actions={
          <Button onClick={() => setFormTarget('create')}>
            <Plus className="h-4 w-4" aria-hidden /> New survey
          </Button>
        }
      />

      <DataTable<Survey, unknown>
        columns={columns}
        data={data}
        getRowId={(s) => s.id}
        rowSelection={EMPTY_ROW_SELECTION}
        isLoading={surveysQuery.isLoading}
        isError={surveysQuery.isError}
        errorState={<ErrorState error={surveysQuery.error} />}
        emptyState={
          <div className="py-4">
            <p className="text-sm font-medium text-foreground">No surveys yet</p>
            <Button variant="outline" className="mt-4" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" aria-hidden /> New survey
            </Button>
          </div>
        }
        pagination={pagination}
        onPaginationChange={setPagination}
        totalRowCount={data.length}
      />

      {formTarget ? <SurveyFormDialog target={formTarget} open={Boolean(formTarget)} onOpenChange={(open) => !open && setFormTarget(null)} /> : null}
    </div>
  );
}
