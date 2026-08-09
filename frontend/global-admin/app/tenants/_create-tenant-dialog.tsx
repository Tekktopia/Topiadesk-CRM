'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { apiFetch, ApiError } from '../_lib/api';
import type { Plan, Tenant } from '../_lib/types';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Global Admin is always served at platform.<root domain> — stripping
 * that prefix client-side gives the same root domain every tenant
 * subdomain hangs off of, with no new env var needed (mirrors
 * tenants.controller.ts's tenantUrl(), which does the same strip
 * server-side from APP_URL's `app.` prefix). Guarded for the server-side
 * render pass, where `window` doesn't exist yet. */
function rootDomain(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.replace(/^platform\./, '');
}

export function CreateTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [planId, setPlanId] = React.useState<string>('');

  const { data: plans } = useQuery({ queryKey: ['plans'], queryFn: () => apiFetch<Plan[]>('/api/plans') });
  const [domain, setDomain] = React.useState('');
  React.useEffect(() => setDomain(rootDomain()), []);

  const createTenant = useMutation({
    mutationFn: () => apiFetch<Tenant>('/api/tenants', { method: 'POST', body: JSON.stringify({ name, slug, primaryContactEmail: email, planId }) }),
    onSuccess: (tenant) => {
      toast.success(`${tenant.name} is provisioning`, { description: 'This usually takes under a minute — refresh the tenant list to see progress.' });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      onOpenChange(false);
      setName('');
      setSlug('');
      setSlugTouched(false);
      setEmail('');
      setPlanId('');
    },
    onError: (err) => {
      toast.error('Could not create tenant', { description: err instanceof ApiError ? err.message : 'Unexpected error' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Create tenant</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new tenant</DialogTitle>
          <DialogDescription>Provisions a dedicated Postgres schema, Keycloak realm, and first ADMIN user for this customer organization.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createTenant.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant-name">Organization name</Label>
            <Input
              id="tenant-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Acme Insurance Brokers"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant-slug">Slug</Label>
            <Input
              id="tenant-slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
              placeholder="acme_insurance"
              required
            />
            <p className="text-xs text-muted-foreground">
              Becomes schema/realm name tenant_{slug || '…'}
              {slug && domain ? (
                <>
                  , reachable at{' '}
                  <span className="font-medium text-foreground">
                    {slug.replace(/_/g, '-')}.{domain}
                  </span>
                </>
              ) : null}
              . Cannot be changed later.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant-email">Primary contact email</Label>
            <Input id="tenant-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@acme-insurance.example" required />
            <p className="text-xs text-muted-foreground">Receives the invite email with their temporary sign-in credentials.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant-plan">Plan</Label>
            <Select value={planId} onValueChange={setPlanId} required>
              <SelectTrigger id="tenant-plan">
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans?.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} ({plan.seatLimit} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createTenant.isPending || !name || !slug || !email || !planId}>
              {createTenant.isPending ? 'Creating…' : 'Create tenant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
