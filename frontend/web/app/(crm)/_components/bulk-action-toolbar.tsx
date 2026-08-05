'use client';

import * as React from 'react';
import { Trash2, UserCog, X } from 'lucide-react';
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
 * Floating toolbar shown above a list's table once at least one row is
 * checked — reassign-owner and delete are the two bulk operations every
 * bulk-capable controller (accounts/leads/opportunities.controller.ts)
 * actually exposes as `bulk/assign` and `bulk/delete`; there is
 * deliberately no generic "bulk edit any field" here (bulk/update exists on
 * the backend for a few specific columns per entity, but wiring a UI for
 * that on top of this — beyond what the brief calls out — was left out of
 * this round's scope).
 */
export function BulkActionToolbar({
  selectedCount,
  onClearSelection,
  reassignLabel,
  onReassign,
  isReassigning,
  onDelete,
  isDeleting,
  entityNamePlural,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  /** e.g. "Reassign owner" or "Reassign to" */
  reassignLabel: string;
  onReassign: (userId: string) => void;
  isReassigning: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  /** e.g. "accounts", "leads" — used in the delete confirmation copy. */
  entityNamePlural: string;
}) {
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
      <p className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
          <UserCog className="h-4 w-4" aria-hidden /> {reassignLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
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
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${selectedCount} ${entityNamePlural}?`}
        description="This permanently removes the selected records. This cannot be undone."
        confirmLabel="Delete"
        destructive
        isPending={isDeleting}
        onConfirm={() => {
          onDelete();
          setDeleteOpen(false);
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
