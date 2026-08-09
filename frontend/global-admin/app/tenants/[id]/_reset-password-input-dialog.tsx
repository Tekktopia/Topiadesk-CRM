'use client';

import * as React from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@topiadesk/ui';

/** First step of the reset flow — asks whether to set a specific password
 * or auto-generate one, before the mutation runs. Result feeds into the
 * existing ResetPasswordDialog either way, so that component (and its
 * "shown until you click Done" persistence) needed no changes. */
export function ResetPasswordInputDialog({
  open,
  onOpenChange,
  userName,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onSubmit: (password: string | undefined) => void;
  isPending: boolean;
}) {
  const [password, setPassword] = React.useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPassword('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {userName}</DialogTitle>
          <DialogDescription>Set a specific password, or leave blank to generate one shown on the next screen.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(password || undefined);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-password-value">Password (optional)</Label>
            <Input id="reset-password-value" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to auto-generate" />
            <p className="text-xs text-muted-foreground">If set, must be 12+ characters with upper/lowercase, a digit, and a special character. Skips the forced password-change on next sign-in.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
