'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { PRODUCER_ASSIGNMENT_ROLES, type ProducerAssignmentRole, type ProducerDto, type ProducerPolicyAssignmentDto } from '@/app/(policy)/lib/types';
import { ConfirmDialog } from '../../_components/confirm-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** The commission-split roster for this policy — who earns what % (PolicyProducerAssignmentController). */
export function ProducersPanel({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<ProducerPolicyAssignmentDto | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['policy-producers', policyId],
    queryFn: () => fetchJson<ProducerPolicyAssignmentDto[]>(`/api/policies/${policyId}/producers`),
  });
  const producersQuery = useQuery({ queryKey: ['producers'], queryFn: () => fetchJson<ProducerDto[]>('/api/producers') });
  const producerById = React.useMemo(() => new Map((producersQuery.data ?? []).map((p) => [p.id, p])), [producersQuery.data]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['policy-producers', policyId] });

  const removeAssignment = useMutation({
    mutationFn: (assignmentId: string) =>
      fetch(`/api/policies/${policyId}/producers/${assignmentId}`, { method: 'DELETE', credentials: 'same-origin' }),
    onSuccess: () => {
      toast.success('Producer removed from this policy');
      invalidate();
      setRemoving(null);
    },
    onError: () => toast.error('Failed to remove producer'),
  });

  const totalSplit = (assignmentsQuery.data ?? []).reduce((sum, a) => sum + Number(a.commissionSplitPercent), 0);

  if (assignmentsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading producers…</p>;
  if (assignmentsQuery.isError) return <p className="text-sm text-destructive">Couldn&apos;t load producers.</p>;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Commission split: {totalSplit}% {totalSplit !== 100 ? <span className="text-warning">(doesn&apos;t total 100%)</span> : null}
        </p>
        <Button size="sm" onClick={() => setAssignOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Assign producer
        </Button>
      </div>

      {(assignmentsQuery.data ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No producers assigned to this policy yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producer</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Split %</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(assignmentsQuery.data ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium text-foreground">
                  <Link href={`/producers/${a.producerId}`} className="hover:underline">
                    {producerById.get(a.producerId)?.name ?? a.producerId.slice(0, 8)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{a.role.replace(/_/g, ' ')}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.commissionSplitPercent}%</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" aria-label="Remove producer" onClick={() => setRemoving(a)}>
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AssignProducerDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        policyId={policyId}
        producers={producersQuery.data ?? []}
        onAssigned={invalidate}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing ? (producerById.get(removing.producerId)?.name ?? 'this producer') : ''} from this policy?`}
        confirmLabel="Remove"
        destructive
        isPending={removeAssignment.isPending}
        onConfirm={() => {
          if (!removing) return;
          removeAssignment.mutate(removing.id);
        }}
      />
    </>
  );
}

function AssignProducerDialog({
  open,
  onOpenChange,
  policyId,
  producers,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  producers: ProducerDto[];
  onAssigned: () => void;
}) {
  const [producerId, setProducerId] = React.useState('');
  const [role, setRole] = React.useState<ProducerAssignmentRole>('PRIMARY');
  const [split, setSplit] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setProducerId('');
      setRole('PRIMARY');
      setSplit('');
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/policies/${policyId}/producers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ producerId, role, commissionSplitPercent: split }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to assign producer');
    },
    onSuccess: () => {
      toast.success('Producer assigned');
      onAssigned();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to assign producer'),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!producerId || !split) {
      toast.error('Select a producer and enter a commission split %');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Assign producer</DialogTitle>
            <DialogDescription>Adds this producer to the commission-split roster for this policy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Producer</Label>
              <Select value={producerId} onValueChange={setProducerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a producer" />
                </SelectTrigger>
                <SelectContent>
                  {producers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as ProducerAssignmentRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCER_ASSIGNMENT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-percent">Commission split %</Label>
              <Input id="split-percent" inputMode="decimal" value={split} onChange={(e) => setSplit(e.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
