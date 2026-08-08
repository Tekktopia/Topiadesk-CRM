'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label, toast } from '@topiadesk/ui';
import { apiFetch, ApiError } from '../../_lib/api';

export function CreateTenantAdminDialog({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');

  const createAdmin = useMutation({
    mutationFn: () => apiFetch<{ status: string }>(`/api/tenants/${tenantId}/users`, { method: 'POST', body: JSON.stringify({ email, fullName }) }),
    onSuccess: () => {
      toast.success('Admin account queued', { description: `${fullName} will receive an invite email shortly — refresh to see them appear.` });
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-admin-summary'] });
      setOpen(false);
      setEmail('');
      setFullName('');
    },
    onError: (err) => {
      toast.error('Could not create admin', { description: err instanceof ApiError ? err.message : 'Unexpected error' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Create admin</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an additional admin</DialogTitle>
          <DialogDescription>Creates a new ADMIN user in this tenant's own Keycloak realm and sends them an invite email.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createAdmin.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant-admin-name">Full name</Label>
            <Input id="tenant-admin-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant-admin-email">Email</Label>
            <Input id="tenant-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createAdmin.isPending || !email || !fullName}>
              {createAdmin.isPending ? 'Creating…' : 'Create admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
