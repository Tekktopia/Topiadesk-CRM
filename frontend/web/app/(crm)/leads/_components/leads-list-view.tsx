'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightLeft, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { LEAD_SOURCES, LEAD_STATUSES, humanize, leadStatusLabel, leadStatusVariant } from '../../_lib/constants';
import { formatDate, fullName } from '../../_lib/format';
import { useDeleteLead, useLeads } from '../../_lib/hooks';
import type { Lead, LeadQuery } from '../../_lib/types';
import { LeadConvertDialog } from './lead-convert-dialog';
import { LeadFormDialog } from './lead-form-dialog';

const UNSET = '__any';

function scoreVariant(score: number): 'success' | 'secondary' | 'outline' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'secondary';
  return 'outline';
}

export function LeadsListView() {
  const [status, setStatus] = React.useState<string>(UNSET);
  const [source, setSource] = React.useState<string>(UNSET);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Lead | null>(null);
  const [deleting, setDeleting] = React.useState<Lead | null>(null);
  const [converting, setConverting] = React.useState<Lead | null>(null);

  const query: LeadQuery = {
    status: status === UNSET ? undefined : (status as LeadQuery['status']),
    source: source === UNSET ? undefined : (source as LeadQuery['source']),
  };

  const { data, isLoading } = useLeads(query);
  const deleteLead = useDeleteLead();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Inbound prospects, scored and ready to qualify."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New lead
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end">
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {leadStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Source</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All sources</SelectItem>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data || data.length === 0 ? (
            <EmptyState
              title="No leads match these filters"
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New lead
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/leads/${lead.id}`} className="hover:underline">
                        {fullName(lead.firstName, lead.lastName)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.companyName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{humanize(lead.source)}</TableCell>
                    <TableCell>
                      <Badge variant={scoreVariant(lead.score)}>{lead.score}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={leadStatusVariant(lead.status)}>{leadStatusLabel(lead.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Lead actions">
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {lead.status !== 'CONVERTED' ? (
                            <DropdownMenuItem onSelect={() => setConverting(lead)}>
                              <ArrowRightLeft aria-hidden /> Convert
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onSelect={() => setEditing(lead)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(lead)}>
                            <Trash2 aria-hidden /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? <LeadFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} lead={editing} /> : null}
      {converting ? (
        <LeadConvertDialog open={Boolean(converting)} onOpenChange={(open) => !open && setConverting(null)} lead={converting} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete lead "${deleting ? fullName(deleting.firstName, deleting.lastName) : ''}"?`}
        description="This permanently removes the lead. This cannot be undone."
        confirmLabel="Delete lead"
        destructive
        isPending={deleteLead.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteLead.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
