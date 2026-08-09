'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@topiadesk/ui';
import { apiFetch, ApiError } from './_lib/api';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_TENANT' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
}

const STATUS_VARIANT: Record<TicketStatus, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'outline',
  WAITING_ON_TENANT: 'secondary',
  RESOLVED: 'success',
  CLOSED: 'secondary',
};

/** Tenant-side "contact support" — open to any authenticated user, no
 * admin gate. Reachable from the account menu, not a sidebar nav item
 * (this route group deliberately has no nav.ts — see account-menu.tsx). */
export default function SupportPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState<TicketPriority>('MEDIUM');

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => apiFetch<SupportTicket[]>('/api/support-tickets'),
  });

  const createTicket = useMutation({
    mutationFn: () => apiFetch('/api/support-tickets', { method: 'POST', body: JSON.stringify({ subject, description, priority }) }),
    onSuccess: () => {
      toast.success('Support ticket submitted', { description: "We'll get back to you shortly — refresh to see it appear." });
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      setOpen(false);
      setSubject('');
      setDescription('');
      setPriority('MEDIUM');
    },
    onError: (err) => toast.error('Could not submit ticket', { description: err instanceof ApiError ? err.message : undefined }),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contact support</h1>
          <p className="text-sm text-muted-foreground">Reach the TopiaDesk team directly — we typically respond within one business day.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit a support ticket</DialogTitle>
              <DialogDescription>Sent to the TopiaDesk team, not your own organization's admins.</DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                createTicket.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ticket-subject">Subject</Label>
                <Input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ticket-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                  <SelectTrigger id="ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ticket-description">Description</Label>
                <Textarea id="ticket-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createTicket.isPending || !subject.trim() || !description.trim()}>
                  {createTicket.isPending ? 'Submitting…' : 'Submit ticket'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : tickets && tickets.length > 0 ? (
            <ul className="divide-y divide-border">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[t.status]}>{t.status.replace(/_/g, ' ')}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">You haven't submitted any support tickets yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
