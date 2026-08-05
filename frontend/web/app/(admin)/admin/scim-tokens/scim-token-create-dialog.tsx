'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
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
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { CreateScimTokenBody, ScimTokenCreatedDto } from '../_lib/types';

/**
 * The backend never stores the raw SCIM token — only its hash — so this
 * response is the ONLY time it's ever retrievable (see
 * backend/api/src/modules/identity/dto/scim-token.dto.ts's
 * ScimTokenCreatedResponseDto comment). Once this dialog is closed there is
 * no way to recover the value; the list view only ever shows the masked
 * description/isActive/lastUsedAt fields afterward.
 */
export function ScimTokenCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [created, setCreated] = useState<ScimTokenCreatedDto | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: (body: CreateScimTokenBody) =>
      apiFetch<ScimTokenCreatedDto>('/api/admin/scim-tokens', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (token) => {
      setCreated(token);
      queryClient.invalidateQueries({ queryKey: ['admin', 'scim-tokens'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create token'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    createMutation.mutate({ description: description.trim() });
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setDescription('');
      setCreated(null);
      setCopied(false);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Token created</DialogTitle>
              <DialogDescription>
                Copy this value now — it won&apos;t be shown again. The server only stores a hash of it, so if you lose
                it you&apos;ll need to revoke this token and create a new one.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="scim-token-value">Bearer token</Label>
              <div className="flex gap-2">
                <Input id="scim-token-value" readOnly value={created.token} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copy token" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use as <code className="font-mono">Authorization: Bearer {'<token>'}</code> against /scim/v2/*.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New SCIM token</DialogTitle>
              <DialogDescription>For an identity provider&apos;s SCIM provisioning connector, e.g. Okta or Azure AD.</DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="scim-token-description">Label</Label>
                <Input
                  id="scim-token-description"
                  placeholder="e.g. Okta provisioning"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || !description.trim()}>
                  {createMutation.isPending ? 'Creating…' : 'Create token'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
