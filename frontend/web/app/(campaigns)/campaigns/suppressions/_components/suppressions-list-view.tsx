'use client';

import * as React from 'react';
import { Badge, Card, CardContent, type ColumnDef, DataTable, DataTableColumnHeader } from '@topiadesk/ui';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import { channelLabel } from '../../../_lib/constants';
import { formatDateTime } from '../../../_lib/format';
import { useCampaignSuppressions } from '../../../_lib/hooks';
import type { CampaignSuppression } from '../../../_lib/types';

/**
 * Read-only, deliberately: suppression rows are only ever created
 * server-side — by the public one-click unsubscribe endpoint
 * (public-unsubscribe.controller.ts) and by bounce/complaint provider
 * webhooks (campaign-webhooks.controller.ts) — and the backend exposes no
 * manual-add and, correctly for NDPR/compliance, no remove either.
 *
 * Backend gap: there is also no authenticated LIST endpoint for
 * campaign_suppressions today (the campaigns module's only suppression
 * writes are the two unauthenticated system routes above; nothing serves an
 * authenticated GET). /api/campaign-suppressions proxies GET
 * /campaign-suppressions so this page lights up automatically once that
 * endpoint lands; until then the upstream 404s and this renders the
 * explicit "not exposed yet" state below — same acknowledged-gap
 * convention as app/(crm)'s industry-directory FormDescription and
 * useDirectoryUsers' 403 degradation.
 */
export function SuppressionsListView() {
  const { data: liveData, isLoading, isError } = useCampaignSuppressions();
  const data = liveData ?? [];
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<CampaignSuppression>[]>(
    () => [
      {
        accessorKey: 'emailOrPhone',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Email / phone" />,
        meta: { label: 'Email / phone' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.emailOrPhone}</span>,
      },
      {
        accessorKey: 'channel',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Channel" />,
        meta: { label: 'Channel' },
        cell: ({ row }) => <Badge variant="outline">{channelLabel(row.original.channel)}</Badge>,
      },
      {
        accessorKey: 'reason',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Reason" />,
        meta: { label: 'Reason' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.reason}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Suppressed at" />,
        meta: { label: 'Suppressed at' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppressions"
        description="Contacts that must never receive campaign sends on a channel — opt-outs, bounces, and complaints. Checked before every send, and one-way by design."
      />

      {isError ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="Suppression list not available"
              description="The API does not expose an authenticated suppression list endpoint yet. Suppressions are still enforced on every send — unsubscribes, bounces, and complaints are recorded and honored server-side; they just can't be browsed here until that endpoint lands."
            />
          </CardContent>
        </Card>
      ) : !isLoading && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No suppressions yet"
              description="Contacts appear here automatically when they unsubscribe or when a send bounces or draws a complaint."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <DataTable<CampaignSuppression, unknown>
              columns={columns}
              data={data}
              getRowId={(s) => s.id}
              isLoading={isLoading}
              isError={isError}
              pagination={pagination}
              onPaginationChange={setPagination}
              totalRowCount={data.length}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
