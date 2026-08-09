'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
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

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (
              plans?.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.seatLimit}</TableCell>
                  <TableCell className="text-muted-foreground">{plan.description ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? 'success' : 'secondary'}>{plan.isActive ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
