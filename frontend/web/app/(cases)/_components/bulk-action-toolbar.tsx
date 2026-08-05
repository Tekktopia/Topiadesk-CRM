'use client';

import * as React from 'react';
import { UserCog, X, type LucideIcon } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { useDirectoryUsers } from '../_lib/hooks';
import { ConfirmDialog } from './confirm-dialog';

/**
 * Floating toolbar shown above a cases/claims DataTable once at least one
 * row is checked. Mirrors app/(crm)/_components/bulk-action-toolbar.tsx's
 * shape (same floating bar + reassign-dialog pattern), but that component is
 * hardwired to reassign + delete — the only two bulk/* operations
 * accounts/leads/opportunities.controller.ts actually expose. Neither
 * cases.controller.ts nor claims.controller.ts has a bulk/* endpoint OR a
 * delete endpoint at all (see hooks.ts's settleAndReport comment), so this
 * is a cases-scoped variant: reassign owner/adjuster (fanned out client-side)
 * plus one caller-supplied "secondary" status-changing bulk action (close
 * for cases, withdraw for claims — see cases-list-view.tsx/
 * claims-list-view.tsx for how each wires it) instead of delete.
 */
export function BulkActionToolbar({
  selectedCount,
  onClearSelection,
  reassignLabel,
  onReassign,
  isReassigning,
  secondaryLabel,
  secondaryIcon: SecondaryIcon,
  secondaryConfirmTitle,
  secondaryConfirmDescription,
  onSecondaryAction,
  isSecondaryPending,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  /** e.g. "Reassign owner" or "Reassign adjuster" */
  reassignLabel: string;
  onReassign: (userId: string) => void;
  isReassigning: boolean;
  /** e.g. "Close" or "Withdraw" */
  secondaryLabel: string;
  secondaryIcon: LucideIcon;
  secondaryConfirmTitle: string;
  secondaryConfirmDescription: string;
  onSecondaryAction: () => void;
  isSecondaryPending: boolean;
}) {
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [secondaryOpen, setSecondaryOpen] = React.useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
      <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
          <UserCog className="h-4 w-4" aria-hidden /> {reassignLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setSecondaryOpen(true)}>
          <SecondaryIcon className="h-4 w-4" aria-hidden /> {secondaryLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="h-4 w-4" aria-hidden /> Clear
        </Button>
      </div>

      <ReassignDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        title={reassignLabel}
        isPending={isReassigning}
        onConfirm={(userId) => {
          onReassign(userId);
          setReassignOpen(false);
        }}
      />
      <ConfirmDialog
        open={secondaryOpen}
        onOpenChange={setSecondaryOpen}
        title={secondaryConfirmTitle}
        description={secondaryConfirmDescription}
        confirmLabel={secondaryLabel}
        isPending={isSecondaryPending}
        onConfirm={() => {
          onSecondaryAction();
          setSecondaryOpen(false);
        }}
      />
    </div>
  );
}

function ReassignDialog({
  open,
  onOpenChange,
  title,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  isPending: boolean;
  onConfirm: (userId: string) => void;
}) {
  const { usersById } = useDirectoryUsers();
  const users = Array.from(usersById.values());
  const [userId, setUserId] = React.useState('');

  React.useEffect(() => {
    if (open) setUserId('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Applies to every currently selected record.</DialogDescription>
        </DialogHeader>
        {users.length > 0 ? (
          <Select value={userId || '__unset'} onValueChange={(v) => setUserId(v === '__unset' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset">Select a user</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-1.5">
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User UUID" />
            <p className="text-xs text-muted-foreground">No directory available for your role — paste a user UUID.</p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(userId)} disabled={isPending || !userId}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
