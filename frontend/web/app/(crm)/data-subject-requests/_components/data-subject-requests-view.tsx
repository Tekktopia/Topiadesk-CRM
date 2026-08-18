'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, FileSpreadsheet, ShieldAlert, ShieldCheck, ShieldX, UserRoundX, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@topiadesk/ui';
import { DataRequestStatsStrip } from '../../_components/data-request-stats-strip';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { formatDateTime } from '../../_lib/format';
import {
  useAccountsLookup,
  useContactsByIds,
  useDataSubjectRequests,
  useDataSubjectRequestStats,
  useProcessDataSubjectRequest,
  useRejectDataSubjectRequest,
} from '../../_lib/hooks';
import type { DataSubjectRequest, DataSubjectRequestStatus, DataSubjectRequestType } from '../../_lib/types';

const UNSET = '__any';

/**
 * A PENDING request this many days old or older is past the statutory
 * response window the API computes `overdue` against. Kept in sync with
 * DSR_RESPONSE_DEADLINE_DAYS via the stats response rather than duplicated
 * as a literal — see DataSubjectRequestStats.
 */
function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function statusVariant(status: DataSubjectRequestStatus): 'outline' | 'success' | 'destructive' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

/**
 * NDPR/GDPR compliance review queue — every logged export/erasure request
 * across all contacts, newest first (this comment used to claim
 * oldest-pending-first, which the API has never done — it orders by
 * createdAt desc). Age and the overdue badge are what surface a breach
 * here, not position in the list. Creating a request happens
 * from the contact itself (account-detail-view.tsx's ContactsTab); this
 * page is purely the fulfillment step, kept as a separate deliberate action
 * (see DataSubjectRequestsController.process()'s header comment for why).
 */
export function DataSubjectRequestsView() {
  const [statusFilter, setStatusFilter] = React.useState<string>('PENDING');
  const [typeFilter, setTypeFilter] = React.useState<string>(UNSET);

  const query = React.useMemo(
    () => ({
      status: statusFilter === UNSET ? undefined : statusFilter,
      requestType: typeFilter === UNSET ? undefined : (typeFilter as DataSubjectRequestType),
    }),
    [statusFilter, typeFilter],
  );

  const { data: requests, isLoading } = useDataSubjectRequests(query);
  // Unfiltered: the strip is the compliance posture of the whole queue.
  // Scoped to the open tab, "Overdue" would read 0 whenever a reviewer was
  // looking at COMPLETED — hiding the one number that carries a legal
  // consequence exactly when it is most reassuring to be wrong about.
  const { data: stats, isLoading: statsLoading } = useDataSubjectRequestStats();
  const { contactsById } = useContactsByIds((requests ?? []).map((r) => r.contactId));
  const { accountsById } = useAccountsLookup();
  const processMutation = useProcessDataSubjectRequest();
  const rejectMutation = useRejectDataSubjectRequest();
  const [pendingProcess, setPendingProcess] = React.useState<DataSubjectRequest | null>(null);
  const [pendingReject, setPendingReject] = React.useState<DataSubjectRequest | null>(null);
  const [viewingExport, setViewingExport] = React.useState<DataSubjectRequest | null>(null);

  /**
   * Downloads the REGISTER (who asked, when, how fast it was answered) —
   * never the exported PII snapshots themselves, which the API strips out.
   * See data-subject-request-csv.ts.
   */
  function handleExport() {
    const qs = new URLSearchParams();
    if (query.status) qs.set('status', query.status);
    if (query.requestType) qs.set('requestType', query.requestType);
    window.location.href = `/api/crm/data-subject-requests/export?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Requests"
        description="NDPR/GDPR export &amp; erasure requests logged against contacts — fulfillment is a deliberate, audited step."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value={UNSET}>All statuses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40" aria-label="Filter by request type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All types</SelectItem>
                <SelectItem value="EXPORT">Export</SelectItem>
                <SelectItem value="DELETE">Erasure</SelectItem>
              </SelectContent>
            </Select>
            {statusFilter !== 'PENDING' || typeFilter !== UNSET ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('PENDING');
                  setTypeFilter(UNSET);
                }}
              >
                <X aria-hidden /> Reset
              </Button>
            ) : null}
            <Button variant="outline" onClick={handleExport} disabled={!requests || requests.length === 0}>
              <FileSpreadsheet aria-hidden /> Export register
            </Button>
          </div>
        }
      />

      <DataRequestStatsStrip stats={stats} isLoading={statsLoading} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden /> Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !requests || requests.length === 0 ? (
            <EmptyState title="No requests" description="Export/erasure requests logged from a contact's actions menu will show up here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => {
                  const contact = contactsById.get(req.contactId);
                  const account = contact?.accountId ? accountsById.get(contact.accountId) : undefined;
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium text-foreground">
                        {contact ? (
                          <Link href={`/accounts/${contact.accountId}`} className="hover:underline">
                            {contact.firstName} {contact.lastName}
                          </Link>
                        ) : (
                          req.contactId
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{account?.name ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {req.requestType === 'DELETE' ? <UserRoundX className="h-3 w-3" aria-hidden /> : <Download className="h-3 w-3" aria-hidden />}
                          {req.requestType === 'DELETE' ? 'Erasure' : 'Export'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(req.createdAt)}</TableCell>
                      <TableCell>{ageCell(req, stats?.deadlineDays)}</TableCell>
                      <TableCell className="text-right">
                        {req.status === 'PENDING' ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setPendingReject(req)}>
                              <ShieldX className="h-3.5 w-3.5" aria-hidden /> Reject
                            </Button>
                            <Button size="sm" onClick={() => setPendingProcess(req)}>
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Fulfill
                            </Button>
                          </div>
                        ) : req.status === 'COMPLETED' && req.requestType === 'EXPORT' && req.exportData ? (
                          <Button size="sm" variant="ghost" onClick={() => setViewingExport(req)}>
                            View export
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingProcess)}
        onOpenChange={(open) => !open && setPendingProcess(null)}
        title={pendingProcess?.requestType === 'DELETE' ? 'Fulfill this erasure request?' : 'Fulfill this export request?'}
        description={
          pendingProcess?.requestType === 'DELETE'
            ? "This immediately anonymizes the contact's name, email, phone, and ID fields in place. Their case, policy, and activity history is preserved but is no longer personally identifiable. This cannot be undone."
            : "This produces a point-in-time snapshot of everything on file for this contact, viewable afterward from this page's \"View export\" link."
        }
        confirmLabel="Fulfill request"
        destructive={pendingProcess?.requestType === 'DELETE'}
        isPending={processMutation.isPending}
        onConfirm={() => {
          if (!pendingProcess) return;
          processMutation.mutate(pendingProcess.id, { onSuccess: () => setPendingProcess(null) });
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingReject)}
        onOpenChange={(open) => !open && setPendingReject(null)}
        title="Reject this request?"
        description="The requester will see this as REJECTED — no data is changed."
        confirmLabel="Reject"
        destructive
        isPending={rejectMutation.isPending}
        onConfirm={() => {
          if (!pendingReject) return;
          rejectMutation.mutate({ id: pendingReject.id, reason: 'Rejected by reviewer' }, { onSuccess: () => setPendingReject(null) });
        }}
      />

      {viewingExport ? (
        <Card className="fixed inset-4 z-50 overflow-auto shadow-brand-lg lg:inset-x-1/4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Export snapshot</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setViewingExport(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(viewingExport.exportData, null, 2)}</pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Age with a breach marker. Only PENDING requests can be overdue — once a
 * request is fulfilled or rejected the clock has stopped, and flagging a
 * long-closed record red would read as an unresolved breach that isn't one.
 *
 * `deadlineDays` is undefined until the stats query lands; the age still
 * renders, just without the badge, rather than briefly asserting a threshold
 * this component made up.
 */
function ageCell(request: DataSubjectRequest, deadlineDays: number | undefined) {
  const days = ageInDays(request.createdAt);
  const label = days === 0 ? 'Today' : `${days}d`;
  const overdue = request.status === 'PENDING' && deadlineDays !== undefined && days >= deadlineDays;
  return overdue ? (
    <Badge variant="destructive">{label} · overdue</Badge>
  ) : (
    <span className="text-muted-foreground tabular-nums">{label}</span>
  );
}
