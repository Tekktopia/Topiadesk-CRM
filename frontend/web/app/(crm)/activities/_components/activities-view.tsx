'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
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
  Input,
  Label,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@topiadesk/ui';
import { useCan } from '@/app/(cases)/_lib/hooks';
import { ActivityStatsStrip } from '../../_components/activity-stats-strip';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { formatDateTime } from '../../_lib/format';
import {
  useAccountsLookup,
  useActivities,
  useActivitiesCount,
  useActivityStats,
  useDeleteActivity,
  useDirectoryUsers,
  useUpdateActivity,
} from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { Activity, ActivityQuery } from '../../_lib/types';

const UNSET = '__any';
const FETCH_CAP = 200;
// Mirrors the ActivityType enum exactly — a value not in the enum would
// 400 at the ValidationPipe rather than simply returning nothing.
const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'WHATSAPP', 'PORTAL_MESSAGE', 'SMS', 'SOCIAL', 'LIVE_CHAT'] as const;

/** Windows a manager actually reviews by. */
const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: UNSET, label: 'All time' },
];

function humanize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * Org-wide interaction log.
 *
 * Activities previously existed only as a per-record timeline, so a branch
 * manager had no way to see what their team actually did this week without
 * opening accounts one at a time — and a call logged against the wrong
 * client could never be corrected. This view answers both.
 *
 * Editing is a CORRECTION, not free mutation: type and direction are fixed
 * (an OUTBOUND email is what satisfies a Case's first-response SLA clock),
 * and transmitted messages are refused outright by the API.
 */
export function ActivitiesView() {
  const canWrite = useCan('activity', 'write');
  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState(UNSET);
  const [direction, setDirection] = React.useState(UNSET);
  const [userId, setUserId] = React.useState(UNSET);
  const [period, setPeriod] = React.useState('30');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [editing, setEditing] = React.useState<Activity | null>(null);
  const [deleting, setDeleting] = React.useState<Activity | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { usersById } = useDirectoryUsers();
  const { accountsById } = useAccountsLookup();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();

  const query = React.useMemo(() => {
    const q: Record<string, unknown> = {
      q: debouncedSearch || undefined,
      type: type === UNSET ? undefined : type,
      direction: direction === UNSET ? undefined : direction,
      createdById: userId === UNSET ? undefined : userId,
      take: FETCH_CAP,
    };
    if (period !== UNSET) {
      const from = new Date();
      from.setDate(from.getDate() - Number(period));
      from.setHours(0, 0, 0, 0);
      q.occurredFrom = from.toISOString();
    }
    return q as ActivityQuery;
  }, [debouncedSearch, type, direction, userId, period]);

  const { data: liveData, isLoading, isError } = useActivities(query);
  const { data: countData } = useActivitiesCount(query);
  const { data: stats, isLoading: statsLoading } = useActivityStats(query);

  // Stable reference — see packages/ui data-table.tsx.
  const rows = React.useMemo(() => liveData ?? [], [liveData]);
  const realTotal = countData?.count ?? rows.length;
  const isTruncated = realTotal > rows.length;
  const hasFilters = Boolean(debouncedSearch) || type !== UNSET || direction !== UNSET || userId !== UNSET || period !== '30';

  const teamOptions = React.useMemo(() => [...usersById.values()], [usersById]);

  const columns = React.useMemo<ColumnDef<Activity>[]>(
    () => [
      {
        accessorKey: 'occurredAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="When" />,
        meta: { label: 'When' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.occurredAt)}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Badge variant="outline">{humanize(row.original.type)}</Badge>
            {row.original.direction ? (
              <span className="text-xs text-muted-foreground">{humanize(row.original.direction)}</span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'subject',
        header: 'Subject',
        meta: { label: 'Subject' },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.original.subject || '—'}</span>
            {row.original.body ? (
              <span className="line-clamp-1 text-xs text-muted-foreground">{row.original.body}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'related',
        header: 'Client',
        meta: { label: 'Client' },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.accountId ? (
            <Link href={`/accounts/${row.original.accountId}`} className="text-foreground hover:underline">
              {accountsById.get(row.original.accountId)?.name ?? 'Account'}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'who',
        header: 'Logged by',
        meta: { label: 'Logged by' },
        enableSorting: false,
        cell: ({ row }) => {
          const id = row.original.createdById;
          // No author means an integration wrote it (inbound email/WhatsApp),
          // which is materially different from a teammate logging a call.
          if (!id) return <Badge variant="secondary">Automated</Badge>;
          return <span className="text-foreground">{usersById.get(id)?.fullName ?? 'Unknown'}</span>;
        },
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          if (!canWrite) return null;
          // A transmitted message is refused by the API; hiding the actions
          // avoids offering something that can only fail.
          const transmitted = Boolean(row.original.externalMessageId);
          if (transmitted) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Activity actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(row.original)}>
                  <Pencil aria-hidden /> Correct
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeleting(row.original)}
                >
                  <Trash2 aria-hidden /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [accountsById, usersById, canWrite],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Every call, email, meeting and note logged across the firm — who did what, and for which client."
      />

      <ActivityStatsStrip stats={stats} isLoading={statsLoading} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="w-full space-y-1.5 sm:w-56">
            <Label htmlFor="activity-search" className="text-xs text-muted-foreground">Search</Label>
            <Input
              id="activity-search"
              placeholder="Subject or note…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label className="text-xs text-muted-foreground">Period</Label>
            <Select value={period} onValueChange={(v) => { setPeriod(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by period"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label className="text-xs text-muted-foreground">Logged by</Label>
            <Select value={userId} onValueChange={(v) => { setUserId(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by team member"><SelectValue placeholder="Anyone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Anyone</SelectItem>
                {teamOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All types</SelectItem>
                {ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <Label className="text-xs text-muted-foreground">Direction</Label>
            <Select value={direction} onValueChange={(v) => { setDirection(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by direction"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Both</SelectItem>
                <SelectItem value="INBOUND">Inbound</SelectItem>
                <SelectItem value="OUTBOUND">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch(''); setType(UNSET); setDirection(UNSET); setUserId(UNSET); setPeriod('30');
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            >
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isTruncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the most recent {rows.length.toLocaleString()} of {realTotal.toLocaleString()} interactions — narrow the period to see the rest.
        </p>
      ) : null}

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title={hasFilters ? 'No activity matches these filters' : 'No activity logged yet'}
              description={
                hasFilters
                  ? 'Try a wider period or a different team member.'
                  : 'Calls, emails and meetings logged against a client appear here, along with anything captured automatically from inbound email or WhatsApp.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Activity, unknown>
          columns={columns}
          data={rows}
          getRowId={(a) => a.id}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={realTotal}
          enableColumnVisibility
        />
      )}

      <CorrectActivityDialog
        activity={editing}
        onClose={() => setEditing(null)}
        isPending={updateActivity.isPending}
        onSave={(input) => {
          if (!editing) return;
          updateActivity.mutate({ id: editing.id, ...input }, { onSuccess: () => setEditing(null) });
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this activity?"
        description="Use this only for an entry logged in error. It permanently removes the record of this interaction."
        confirmLabel="Remove"
        destructive
        isPending={deleteActivity.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteActivity.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

/**
 * Correction form. Type and direction are shown read-only rather than
 * omitted, so it's clear WHY they can't be changed rather than looking like
 * an oversight.
 */
function CorrectActivityDialog({
  activity,
  onClose,
  onSave,
  isPending,
}: {
  activity: Activity | null;
  onClose: () => void;
  onSave: (input: { subject?: string; body?: string; outcome?: string }) => void;
  isPending: boolean;
}) {
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [outcome, setOutcome] = React.useState('');

  React.useEffect(() => {
    setSubject(activity?.subject ?? '');
    setBody(activity?.body ?? '');
    setOutcome(activity?.outcome ?? '');
  }, [activity]);

  return (
    <Dialog open={Boolean(activity)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {activity ? `${humanize(activity.type)}${activity.direction ? ` · ${humanize(activity.direction)}` : ''}` : ''} — the
            type and direction are fixed, because they determine service-level timings.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="correct-subject">Subject</Label>
            <Input id="correct-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correct-body">Note</Label>
            <Textarea id="correct-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correct-outcome">Outcome</Label>
            <Input id="correct-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onSave({ subject, body, outcome })} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
