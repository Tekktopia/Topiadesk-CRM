'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES, campaignStatusLabel, campaignStatusVariant, channelLabel } from '../../_lib/constants';
import { formatDateTime } from '../../_lib/format';
import { useCampaignRecipientCounts, useCampaigns } from '../../_lib/hooks';
import type { Campaign, CampaignChannel, CampaignQuery, CampaignStatus } from '../../_lib/types';
import { CampaignFormDialog } from './campaign-form-dialog';

const UNSET = '__any';

// Stable empty object — see EMPTY_ROW_SELECTION comment in
// app/(knowledge)/knowledge/knowledge-list-view.tsx. Workaround for a
// data-table.tsx bug where an omitted `rowSelection` prop crashes every
// real row via TanStack's unguarded `selection[row.id]`.
const EMPTY_ROW_SELECTION: RowSelectionState = {};

export function CampaignsListView() {
  const [status, setStatus] = React.useState<string>(UNSET);
  const [channel, setChannel] = React.useState<string>(UNSET);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const query: CampaignQuery = {
    status: status === UNSET ? undefined : (status as CampaignStatus),
    channel: channel === UNSET ? undefined : (channel as CampaignChannel),
  };

  const { data: liveData, isLoading, isError, isFetching } = useCampaigns(query);
  const data = liveData ?? [];
  const { countsById } = useCampaignRecipientCounts(data.map((c) => c.id));

  const columns = React.useMemo<ColumnDef<Campaign>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => (
          <>
            <Link href={`/campaigns/${row.original.id}`} className="font-medium text-foreground hover:underline">
              {row.original.name}
            </Link>
            {row.original.abTestEnabled ? (
              <Badge variant="outline" className="ml-2">
                A/B
              </Badge>
            ) : null}
          </>
        ),
      },
      {
        accessorKey: 'channel',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Channel" />,
        meta: { label: 'Channel' },
        cell: ({ row }) => <span className="text-muted-foreground">{channelLabel(row.original.channel)}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={campaignStatusVariant(row.original.status)}>{campaignStatusLabel(row.original.status)}</Badge>,
      },
      {
        id: 'sendDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Scheduled / sent" />,
        meta: { label: 'Scheduled / sent' },
        accessorFn: (c) => c.sentAt ?? c.scheduledSendAt,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.sentAt ? formatDateTime(row.original.sentAt) : formatDateTime(row.original.scheduledSendAt)}
          </span>
        ),
        sortingFn: (a, b) => {
          const av = a.original.sentAt ?? a.original.scheduledSendAt;
          const bv = b.original.sentAt ?? b.original.scheduledSendAt;
          return (av ? new Date(av).getTime() : 0) - (bv ? new Date(bv).getTime() : 0);
        },
      },
      {
        id: 'recipients',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Recipients" />,
        meta: { label: 'Recipients' },
        accessorFn: (c) => countsById.get(c.id) ?? -1,
        cell: ({ row }) => <span className="text-muted-foreground">{countsById.get(row.original.id)?.toLocaleString() ?? '—'}</span>,
      },
    ],
    [countsById],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Email, SMS, and WhatsApp sends to your audience segments."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New campaign
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {CAMPAIGN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {campaignStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Channel</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All channels</SelectItem>
                {CAMPAIGN_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {channelLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!isLoading && !isError && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No campaigns match these filters"
              description="Try clearing a filter, or create a new campaign to get started."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New campaign
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              {isFetching ? <Loader2 className="absolute right-0 top-0 h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
              <DataTable<Campaign, unknown>
                columns={columns}
                data={data}
                getRowId={(c) => c.id}
                rowSelection={EMPTY_ROW_SELECTION}
                isLoading={isLoading}
                isError={isError}
                pagination={pagination}
                onPaginationChange={setPagination}
                totalRowCount={data.length}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
