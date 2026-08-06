'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@topiadesk/ui';
import { useCreateSite, useUpdateSite } from '../../_lib/hooks';
import type { Site } from '../../_lib/types';

/** Create/edit dialog for a Site (an account's branch/location) — same shape as contact-form-dialog.tsx, one form for both. */
export function SiteFormDialog({
  open,
  onOpenChange,
  accountId,
  site,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  site?: Site;
}) {
  const isEdit = Boolean(site);
  const [name, setName] = React.useState('');
  const [addressLine1, setAddressLine1] = React.useState('');
  const [city, setCity] = React.useState('');
  const [state, setState] = React.useState('');
  const [isPrimary, setIsPrimary] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(site?.name ?? '');
      setAddressLine1(site?.addressLine1 ?? '');
      setCity(site?.city ?? '');
      setState(site?.state ?? '');
      setIsPrimary(site?.isPrimary ?? false);
    }
  }, [open, site]);

  const createSite = useCreateSite(accountId);
  const updateSite = useUpdateSite(accountId);
  const isPending = createSite.isPending || updateSite.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Site name is required');
      return;
    }
    const payload = {
      name: name.trim(),
      addressLine1: addressLine1 || undefined,
      city: city || undefined,
      state: state || undefined,
      isPrimary,
    };
    if (isEdit && site) {
      await updateSite.mutateAsync({ id: site.id, input: payload });
    } else {
      await createSite.mutateAsync(payload);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit site' : 'Add site'}</DialogTitle>
            <DialogDescription>A separate branch or location for this account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="site-name">Name</Label>
              <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Abuja branch" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-address">Address</Label>
              <Input id="site-address" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="site-city">City</Label>
                <Input id="site-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="site-state">State</Label>
                <Input id="site-state" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
              />
              Primary site for this account
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Add site'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
