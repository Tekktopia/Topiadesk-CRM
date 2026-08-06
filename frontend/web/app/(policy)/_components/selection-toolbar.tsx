'use client';

import { X } from 'lucide-react';
import { Button } from '@topiadesk/ui';
import type { ReactNode } from 'react';

/**
 * Floating bar shown above a list's table once at least one row is
 * checked — same shape as app/(crm)/_components/bulk-action-toolbar.tsx
 * and app/(cases)/_components/bulk-action-toolbar.tsx, but presentational
 * only: each Policy/Premium/Document list has a different bulk-verb set
 * (reassign+cancel / mark-paid / archive+categorize), so this just renders
 * the bar chrome + Clear button and leaves the action buttons (and their
 * own confirm dialogs) to the caller via `children`.
 */
export function SelectionToolbar({
  selectedCount,
  onClearSelection,
  children,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  children: ReactNode;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
      <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>
      <div className="flex items-center gap-2">
        {children}
        <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="h-4 w-4" aria-hidden /> Clear
        </Button>
      </div>
    </div>
  );
}
