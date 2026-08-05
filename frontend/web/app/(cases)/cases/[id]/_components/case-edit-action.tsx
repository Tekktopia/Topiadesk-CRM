'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@topiadesk/ui';
import { CaseFormDialog } from '../../_components/case-form-dialog';
import type { Case } from '../../../_lib/types';

/** Opens CaseFormDialog pre-filled with `kase` — case-form-dialog.tsx switches to PATCH /cases/:id (useUpdateCase) whenever it's given an existing record. */
export function CaseEditAction({ kase }: { kase: Case }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil aria-hidden /> Edit
      </Button>
      <CaseFormDialog open={open} onOpenChange={setOpen} kase={kase} />
    </>
  );
}
