'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label, toast } from '@topiadesk/ui';
import { apiFetch, ApiError } from '../_lib/api';

export function CreateAdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');

  const createAdmin = useMutation({
    mutationFn: () => apiFetch<{ status: string }>('/api/admins', { method: 'POST', body: JSON.stringify({ email, fullName }) }),
    onSuccess: () => {
      toast.success('Platform admin queued', { description: `${fullName} will receive an invite email once their account finishes creating — refresh to see them appear.` });
      queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
      onOpenChange(false);
      setEmail('');
      setFullName('');
    },
    onError: (err) => {
      toast.error('Could not create platform admin', { description: err instanceof ApiError ? err.message : 'Unexpected error' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Add platform admin</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a platform admin</DialogTitle>
          <DialogDescription>Creates a new operator account for the "topiadesk-platform" realm with full Global Admin access.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createAdmin.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-name">Full name</Label>
            <Input id="admin-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Ade" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@topiadesk.com" required />
            <p className="text-xs text-muted-foreground">Receives the invite email with their temporary sign-in password.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createAdmin.isPending || !email || !fullName}>
              {createAdmin.isPending ? 'Creating…' : 'Add platform admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
