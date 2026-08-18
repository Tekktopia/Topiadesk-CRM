'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { participantTypeLabel } from '@/app/(policy)/lib/format';
import { csrfHeaders } from '@/lib/csrf';
import { PARTICIPANT_TYPES, type ParticipantType, type PolicyParticipantDto } from '@/app/(policy)/lib/types';
import { ConfirmDialog } from '../../_components/confirm-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
}

const NONE = '__none__';

/** FSC's InsurancePolicyParticipant — Insured/Beneficiary/Nominee/Driver/Additional Insured on this policy. */
export function ParticipantsPanel({ policyId, accountId }: { policyId: string; accountId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PolicyParticipantDto | null>(null);
  const [deleting, setDeleting] = React.useState<PolicyParticipantDto | null>(null);

  const participantsQuery = useQuery({
    queryKey: ['policy-participants', policyId],
    queryFn: () => fetchJson<PolicyParticipantDto[]>(`/api/policies/${policyId}/participants`),
  });
  const contactsQuery = useQuery({
    queryKey: ['account-contacts', accountId],
    queryFn: () => fetchJson<ContactOption[]>(`/api/crm/contacts?accountId=${accountId}`),
    enabled: Boolean(accountId),
    staleTime: 5 * 60_000,
  });
  const contacts = React.useMemo(() => contactsQuery.data ?? [], [contactsQuery.data]);
  const contactById = React.useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['policy-participants', policyId] });

  const deleteParticipant = useMutation({
    mutationFn: (participantId: string) =>
      fetch(`/api/policies/${policyId}/participants/${participantId}`, { method: 'DELETE', credentials: 'same-origin', headers: csrfHeaders('DELETE') }),
    onSuccess: () => {
      toast.success('Participant removed');
      invalidate();
      setDeleting(null);
    },
    onError: () => toast.error('Failed to remove participant'),
  });

  if (participantsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading participants…</p>;
  if (participantsQuery.isError) return <p className="text-sm text-destructive">Couldn&apos;t load participants.</p>;

  return (
    <>
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add participant
        </Button>
      </div>

      {(participantsQuery.data ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No participants recorded for this policy yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead>Linked contact</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(participantsQuery.data ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{participantTypeLabel(p.participantType)}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.relationship ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{p.percentage ? `${p.percentage}%` : '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.contactId && contactById.get(p.contactId)
                    ? `${contactById.get(p.contactId)!.firstName} ${contactById.get(p.contactId)!.lastName}`
                    : '—'}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Participant actions">
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(p)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(p)}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ParticipantFormDialog open={createOpen} onOpenChange={setCreateOpen} policyId={policyId} contacts={contacts} onSaved={invalidate} />
      {editing ? (
        <ParticipantFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          policyId={policyId}
          participant={editing}
          contacts={contacts}
          onSaved={invalidate}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove "${deleting?.name}"?`}
        confirmLabel="Remove"
        destructive
        isPending={deleteParticipant.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteParticipant.mutate(deleting.id);
        }}
      />
    </>
  );
}

function ParticipantFormDialog({
  open,
  onOpenChange,
  policyId,
  participant,
  contacts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  participant?: PolicyParticipantDto;
  contacts: ContactOption[];
  onSaved: () => void;
}) {
  const isEdit = Boolean(participant);
  const [participantType, setParticipantType] = React.useState<ParticipantType>('INSURED');
  const [name, setName] = React.useState('');
  const [contactId, setContactId] = React.useState(NONE);
  const [relationship, setRelationship] = React.useState('');
  const [percentage, setPercentage] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setParticipantType(participant?.participantType ?? 'INSURED');
      setName(participant?.name ?? '');
      setContactId(participant?.contactId ?? NONE);
      setRelationship(participant?.relationship ?? '');
      setPercentage(participant?.percentage ?? '');
    }
  }, [open, participant]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        participantType,
        name,
        contactId: contactId === NONE ? undefined : contactId,
        relationship: relationship || undefined,
        percentage: percentage || undefined,
      };
      const url = isEdit ? `/api/policies/${policyId}/participants/${participant!.id}` : `/api/policies/${policyId}/participants`;
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders(method) },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to save participant');
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Participant updated' : 'Participant added');
      onSaved();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save participant'),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit participant' : 'Add participant'}</DialogTitle>
            <DialogDescription>Insured/Beneficiary/Nominee/Driver/Additional Insured on this policy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Participant type</Label>
              <Select value={participantType} onValueChange={(v) => setParticipantType(v as ParticipantType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTICIPANT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {participantTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="participant-name">Name</Label>
              <Input id="participant-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Linked contact (optional)</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Not in CRM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not in CRM</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="participant-relationship">Relationship</Label>
              <Input id="participant-relationship" placeholder="Spouse, Child, Business partner…" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="participant-percentage">Percentage</Label>
              <Input id="participant-percentage" inputMode="decimal" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Add participant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
