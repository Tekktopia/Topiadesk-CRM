'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@topiadesk/ui';
import { ClaimFormDialog } from '../../_components/claim-form-dialog';
import type { Claim } from '../../../_lib/types';

/** Opens ClaimFormDialog pre-filled with `claim` — claim-form-dialog.tsx switches to PATCH /claims/:id (useUpdateClaim) whenever it's given an existing record. */
export function ClaimEditAction({ claim }: { claim: Claim }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil aria-hidden /> Edit
      </Button>
      <ClaimFormDialog open={open} onOpenChange={setOpen} claim={claim} />
    </>
  );
}
