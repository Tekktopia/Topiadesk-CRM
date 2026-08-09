'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, toast } from '@topiadesk/ui';
import { apiFetch, ApiError } from '../../_lib/api';
import type { PlatformAdmin, PlatformSupportTicket, SupportTicketPriority, SupportTicketStatus } from '../../_lib/types';
import { TicketPriorityBadge, TicketStatusBadge } from '../_badges';
import { PageHeader } from '../../_components/page-header';

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_TENANT', 'RESOLVED', 'CLOSED'];
const PRIORITIES: SupportTicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const UNASSIGNED = '__unassigned__';

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reply, setReply] = React.useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['support-tickets', params.id],
    queryFn: () => apiFetch<PlatformSupportTicket>(`/api/support-tickets/${params.id}`),
  });

  const { data: admins } = useQuery({ queryKey: ['platform-admins'], queryFn: () => apiFetch<PlatformAdmin[]>('/api/admins') });

  const update = useMutation({
    mutationFn: (patch: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedToId?: string | null }) =>
      apiFetch(`/api/support-tickets/${params.id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets', params.id] });
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: (err) => toast.error('Could not update ticket', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const addComment = useMutation({
    mutationFn: () => apiFetch(`/api/support-tickets/${params.id}/comments`, { method: 'POST', body: JSON.stringify({ body: reply }) }),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['support-tickets', params.id] });
    },
    onError: (err) => toast.error('Could not post reply', { description: err instanceof ApiError ? err.message : undefined }),
  });

  if (isLoading || !ticket) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={
          <>
            <p className="text-xs font-normal text-muted-foreground">{ticket.tenantName}</p>
            {ticket.subject}
          </>
        }
        description={
          <>
            Raised by {ticket.raisedByName} ({ticket.raisedByEmail})
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select value={ticket.status} onValueChange={(v) => update.mutate({ status: v as SupportTicketStatus })}>
                <SelectTrigger className="h-8">
                  <SelectValue>
                    <TicketStatusBadge status={ticket.status} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Priority</span>
              <Select value={ticket.priority} onValueChange={(v) => update.mutate({ priority: v as SupportTicketPriority })}>
                <SelectTrigger className="h-8">
                  <SelectValue>
                    <TicketPriorityBadge priority={ticket.priority} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Assigned to</span>
              <Select
                value={ticket.assignedToId ?? UNASSIGNED}
                onValueChange={(v) => update.mutate({ assignedToId: v === UNASSIGNED ? null : v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {admins?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {ticket.comments && ticket.comments.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {ticket.comments.map((c) => (
                <li key={c.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{c.authorName}</span>
                    <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No replies yet.</p>
          )}

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addComment.mutate();
            }}
          >
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to this ticket…" rows={3} />
            <Button type="submit" className="self-end" disabled={addComment.isPending || !reply.trim()}>
              {addComment.isPending ? 'Sending…' : 'Reply'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
