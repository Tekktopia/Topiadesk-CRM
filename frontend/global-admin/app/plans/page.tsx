'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  DataTableColumnHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  toast,
  type ColumnDef,
} from '@topiadesk/ui';
import { apiFetch, ApiError } from '../_lib/api';
import type { Plan } from '../_lib/types';
import { PageHeader } from '../_components/page-header';

export default function PlansPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [seatLimit, setSeatLimit] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [editingPlan, setEditingPlan] = React.useState<Plan | null>(null);

  const { data: plans, isLoading } = useQuery({ queryKey: ['plans'], queryFn: () => apiFetch<Plan[]>('/api/plans') });

  const createPlan = useMutation({
    mutationFn: () =>
      apiFetch<Plan>('/api/plans', {
        method: 'POST',
        body: JSON.stringify({ name, seatLimit: Number(seatLimit), description: description || undefined }),
      }),
    onSuccess: () => {
      toast.success('Plan created');
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setDialogOpen(false);
      setName('');
      setSeatLimit('');
      setDescription('');
    },
    onError: (err) => toast.error('Could not create plan', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const updatePlan = useMutation({
    mutationFn: (patch: { id: string; name: string; seatLimit: number; description?: string; isActive: boolean }) =>
      apiFetch<Plan>(`/api/plans/${patch.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: patch.name, seatLimit: patch.seatLimit, description: patch.description, isActive: patch.isActive }),
      }),
    onSuccess: () => {
      toast.success('Plan updated');
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setEditingPlan(null);
    },
    onError: (err) => toast.error('Could not update plan', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const columns = React.useMemo<ColumnDef<Plan>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { accessorKey: 'seatLimit', header: ({ column }) => <DataTableColumnHeader column={column} label="Seats" /> },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.description ?? '—'}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.name}`} onClick={() => setEditingPlan(row.original)}>
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Plans"
        description="Seat limits and pricing tiers tenants subscribe to."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>New plan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a plan</DialogTitle>
                <DialogDescription>Internal plan/status tracking only — no payment processing in this pass.</DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createPlan.mutate();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plan-name">Name</Label>
                  <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Professional" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plan-seats">Seat limit</Label>
                  <Input id="plan-seats" type="number" min={1} value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plan-description">Description</Label>
                  <Input id="plan-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Growing brokerages with multiple branches." />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createPlan.isPending || !name || !seatLimit}>
                    {createPlan.isPending ? 'Creating…' : 'Create plan'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <DataTable columns={columns} data={plans ?? []} getRowId={(p) => p.id} isLoading={isLoading} emptyState={<p className="text-muted-foreground">No plans yet.</p>} />

      {editingPlan ? <EditPlanDialog plan={editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)} onSave={(patch) => updatePlan.mutate(patch)} isPending={updatePlan.isPending} /> : null}
    </div>
  );
}

function EditPlanDialog({
  plan,
  onOpenChange,
  onSave,
  isPending,
}: {
  plan: Plan;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { id: string; name: string; seatLimit: number; description?: string; isActive: boolean }) => void;
  isPending: boolean;
}) {
  const [name, setName] = React.useState(plan.name);
  const [seatLimit, setSeatLimit] = React.useState(String(plan.seatLimit));
  const [description, setDescription] = React.useState(plan.description ?? '');
  const [isActive, setIsActive] = React.useState(plan.isActive);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {plan.name}</DialogTitle>
          <DialogDescription>Changes apply to every tenant currently subscribed to this plan.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ id: plan.id, name, seatLimit: Number(seatLimit), description: description || undefined, isActive });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-plan-name">Name</Label>
            <Input id="edit-plan-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-plan-seats">Seat limit</Label>
            <Input id="edit-plan-seats" type="number" min={1} value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-plan-description">Description</Label>
            <Input id="edit-plan-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="edit-plan-active" checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
            <Label htmlFor="edit-plan-active" className="font-normal">
              Active — visible when assigning a plan to a tenant
            </Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending || !name || !seatLimit}>
              {isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
