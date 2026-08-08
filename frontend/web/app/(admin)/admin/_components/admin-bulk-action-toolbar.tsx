'use client';

import { useState } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { Button } from '@topiadesk/ui';
import { ConfirmDialog } from './confirm-dialog';

export interface AdminBulkAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  isPending?: boolean;
  destructive?: boolean;
  /** Shows a ConfirmDialog before calling onClick — omit for actions safe to fire immediately (e.g. bulk-activate). */
  confirmTitle?: string;
  confirmDescription?: string;
}

/**
 * Floating toolbar shown above an admin list's table once at least one row
 * is checked. Unlike app/(crm)/_components/bulk-action-toolbar.tsx (which
 * hardcodes the two CRM-entity actions every bulk-capable CRM controller
 * shares — reassign + delete), the admin tables in this batch each expose
 * a different, smaller action set (bulk revoke, bulk toggle-active, bulk
 * deactivate/reactivate, ...), so this takes an arbitrary action list
 * instead of fixed props.
 */
export function AdminBulkActionToolbar({
  selectedCount,
  onClearSelection,
  actions,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  actions: AdminBulkAction[];
}) {
  const [confirming, setConfirming] = useState<AdminBulkAction | null>(null);

  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
      <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="outline"
            size="sm"
            className={action.destructive ? 'text-destructive hover:text-destructive' : undefined}
            disabled={action.isPending}
            onClick={() => (action.confirmTitle ? setConfirming(action) : action.onClick())}
          >
            <action.icon className="h-4 w-4" aria-hidden /> {action.label}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="h-4 w-4" aria-hidden /> Clear
        </Button>
      </div>

      {confirming ? (
        <ConfirmDialog
          open={!!confirming}
          onOpenChange={(open) => !open && setConfirming(null)}
          title={confirming.confirmTitle!}
          description={confirming.confirmDescription}
          confirmLabel={confirming.label}
          destructive={confirming.destructive}
          isPending={confirming.isPending}
          onConfirm={() => {
            confirming.onClick();
            setConfirming(null);
          }}
        />
      ) : null}
    </div>
  );
}
