'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { Link2 } from 'lucide-react';
import type { PolicyDto } from '@/app/(policy)/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Links an existing document to a Policy (POST /api/documents/:id/links,
 * `{entityType: 'POLICY', entityId}`) — the standalone /documents
 * manager's counterpart to the policy detail page's "upload & auto-link"
 * flow, for documents that already exist and just need attaching. */
export function LinkToPolicyDialog({ documentId, fileName, onLinked }: { documentId: string; fileName: string; onLinked: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [policyId, setPolicyId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const policiesQuery = useQuery({
    queryKey: ['policies-lookup'],
    queryFn: () => fetchJson<PolicyDto[]>('/api/policies'),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!policyId) {
      toast.error('Choose a policy');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'POLICY', entityId: policyId }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to link document');
      toast.success('Linked to policy.');
      setOpen(false);
      setPolicyId('');
      onLinked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link document');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Link to a policy">
          <Link2 className="h-4 w-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Link {fileName} to a policy</DialogTitle>
            <DialogDescription>Makes this document visible on the chosen policy&apos;s Documents tab.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="policy">Policy</Label>
              <Select value={policyId} onValueChange={setPolicyId}>
                <SelectTrigger id="policy">
                  <SelectValue placeholder="Choose a policy" />
                </SelectTrigger>
                <SelectContent>
                  {(policiesQuery.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.policyNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Linking…' : 'Link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
