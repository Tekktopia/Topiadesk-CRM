'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, toast } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { ScimTokenDto } from '../_lib/types';

/** The label/description is the only field editable after creation — the
 * raw token itself is never re-shown (see ScimTokenCreateDialog's own
 * comment); revoke/delete are the only other ways to change a token's
 * usability. */
export function ScimTokenEditDialog({
  target,
  open,
  onOpenChange,
}: {
  target: ScimTokenDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (target) setDescription(target.description);
  }, [target]);

  const updateMutation = useMutation({
    mutationFn: (body: { description: string }) =>
      apiFetch<ScimTokenDto>(`/api/admin/scim-tokens/${target?.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Token label updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'scim-tokens'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update token'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    updateMutation.mutate({ description: description.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit token label</DialogTitle>
          <DialogDescription>Only the label can be changed — the bearer token value itself can&apos;t be edited, only revoked.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="scim-token-edit-description">Label</Label>
            <Input id="scim-token-edit-description" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !description.trim()}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
