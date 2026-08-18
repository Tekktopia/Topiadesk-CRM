'use client';

import * as React from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { useDirectoryUsers, useTransferAccountOwner } from '../../../_lib/hooks';

/**
 * Distinct from the account form's ownerId field — this is the deliberate,
 * audited "hand this account to someone else" action (writes a dedicated
 * OWNERSHIP_TRANSFERRED audit row with a captured reason, see
 * AccountsController.transferOwner()), not a generic field edit.
 */
export function TransferOwnerDialog({
  open,
  onOpenChange,
  accountId,
  currentOwnerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  currentOwnerId: string;
}) {
  const { usersById } = useDirectoryUsers();
  const users = Array.from(usersById.values()).filter((u) => u.id !== currentOwnerId);
  const [newOwnerId, setNewOwnerId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const transferOwner = useTransferAccountOwner(accountId);

  React.useEffect(() => {
    if (open) {
      setNewOwnerId('');
      setReason('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>Hands this account to another user — recorded as a dedicated, auditable ownership transfer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>New owner</Label>
            {users.length > 0 ? (
              <Select value={newOwnerId || '__unset'} onValueChange={(v) => setNewOwnerId(v === '__unset' ? '' : v)}>
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
              <Input value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)} placeholder="User UUID" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Reason (optional)</Label>
            <Input id="transfer-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Broker reassignment, territory change" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={transferOwner.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={transferOwner.isPending || !newOwnerId}
            onClick={() =>
              transferOwner.mutate(
                { newOwnerId, reason: reason || undefined },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
