'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@topiadesk/ui';

/** Shows a freshly-generated temp password exactly once — controlled from
 * the parent (opened right after a successful reset-password mutation),
 * not a self-contained trigger like the other dialogs here, since there's
 * nothing to show until the mutation returns. Closing forgets it: this
 * component holds no state of its own beyond the copy-button's transient
 * "copied" flash. */
export function ResetPasswordDialog({
  open,
  onOpenChange,
  userName,
  temporaryPassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  temporaryPassword: string | null;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Password reset for {userName}</DialogTitle>
          <DialogDescription>
            This temporary password is shown once and not stored anywhere — relay it to {userName} now. They'll be required to set a new password on next
            sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={temporaryPassword ?? ''} className="font-mono" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              if (!temporaryPassword) return;
              navigator.clipboard.writeText(temporaryPassword);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            aria-label="Copy password"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
