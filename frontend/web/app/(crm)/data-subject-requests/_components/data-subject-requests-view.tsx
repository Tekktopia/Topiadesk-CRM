'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, ShieldAlert, ShieldCheck, ShieldX, UserRoundX } from 'lucide-react';
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
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { formatDateTime } from '../../_lib/format';
import { useAccountsLookup, useContactsByIds, useDataSubjectRequests, useProcessDataSubjectRequest, useRejectDataSubjectRequest } from '../../_lib/hooks';
import type { DataSubjectRequest, DataSubjectRequestStatus } from '../../_lib/types';

const UNSET = '__any';

function statusVariant(status: DataSubjectRequestStatus): 'outline' | 'success' | 'destructive' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

/**
 * NDPR/GDPR compliance review queue — every logged export/erasure request
 * across all contacts, oldest-pending-first. Creating a request happens
 * from the contact itself (account-detail-view.tsx's ContactsTab); this
 * page is purely the fulfillment step, kept as a separate deliberate action
 * (see DataSubjectRequestsController.process()'s header comment for why).
 */
export function DataSubjectRequestsView() {
  const [statusFilter, setStatusFilter] = React.useState<string>('PENDING');
  const { data: requests, isLoading } = useDataSubjectRequests(statusFilter === UNSET ? undefined : { status: statusFilter });
  const { contactsById } = useContactsByIds((requests ?? []).map((r) => r.contactId));
  const { accountsById } = useAccountsLookup();
  const processMutation = useProcessDataSubjectRequest();
  const rejectMutation = useRejectDataSubjectRequest();
  const [pendingProcess, setPendingProcess] = React.useState<DataSubjectRequest | null>(null);
  const [pendingReject, setPendingReject] = React.useState<DataSubjectRequest | null>(null);
  const [viewingExport, setViewingExport] = React.useState<DataSubjectRequest | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Requests"
        description="NDPR/GDPR export &amp; erasure requests logged against contacts — fulfillment is a deliberate, audited step."
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value={UNSET}>All</SelectItem>
            </SelectContent>
          </Select>
        }
      />

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
