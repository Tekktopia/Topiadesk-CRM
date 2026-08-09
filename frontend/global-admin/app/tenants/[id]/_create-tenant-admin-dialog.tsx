'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label, toast } from '@topiadesk/ui';
import { apiFetch, ApiError } from '../../_lib/api';

export function CreateTenantAdminDialog({ tenantId, tenantUrl }: { tenantId: string; tenantUrl: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [password, setPassword] = React.useState('');

  const createAdmin = useMutation({
    mutationFn: () =>
      apiFetch<{ status: string }>(`/api/tenants/${tenantId}/users`, {
        method: 'POST',
        body: JSON.stringify({ email, fullName, password: password || undefined }),
      }),
    onSuccess: () => {
      // Still an async job either way — creation itself is queued, same
      // as before. Setting a password just means there's no need to wait
      // on email delivery to hand off working credentials.
      const signInUrl = tenantUrl ? tenantUrl.replace(/^https:\/\//, '') : null;
      toast.success('Admin account queued', {
        // The URL is the other half of what to hand off alongside the
        // password — easy to lose track of once you're several tenants
        // deep, so it's repeated here rather than only on the tenant's
        // own header.
        description: password
          ? `${fullName} can sign in with the password you set once this finishes (usually a few seconds)${signInUrl ? ` — at ${signInUrl}` : ''}.`
          : `${fullName} will receive an invite email shortly${signInUrl ? ` — they'll sign in at ${signInUrl}` : ''}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-admin-summary'] });
      setOpen(false);
      setEmail('');
      setFullName('');
      setPassword('');
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
          <DialogDescription>Creates a new ADMIN user in this tenant&apos;s own Keycloak realm and sends them an invite email.</DialogDescription>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant-admin-password">Password (optional)</Label>
            <Input id="tenant-admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to auto-generate and email" />
            <p className="text-xs text-muted-foreground">
              If set, must be 12+ characters with upper/lowercase, a digit, and a special character. Skips the invite email&apos;s password line — they still get MFA set-up on first sign-in.
            </p>
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
