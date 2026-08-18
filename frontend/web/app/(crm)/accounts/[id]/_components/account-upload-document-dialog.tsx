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
import { Upload } from 'lucide-react';
import { csrfHeaders } from '@/lib/csrf';

interface DocumentCategory {
  id: string;
  name: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const NO_CATEGORY = 'NONE';

/** Mirrors carrier-upload-document-dialog.tsx's shape, pointed at `entityType: 'ACCOUNT'`. Local copy, same cross-route-group reasoning as that file. */
export function AccountUploadDocumentDialog({ accountId, onUploaded }: { accountId: string; onUploaded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [categoryId, setCategoryId] = React.useState(NO_CATEGORY);
  const [submitting, setSubmitting] = React.useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['document-categories'],
    queryFn: () => fetchJson<DocumentCategory[]>('/api/documents/categories'),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error('Choose a file to upload');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (categoryId !== NO_CATEGORY) formData.append('categoryId', categoryId);

      const uploadRes = await fetch('/api/documents', { method: 'POST', headers: csrfHeaders('POST'), body: formData });
      const uploaded = (await uploadRes.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!uploadRes.ok || !uploaded?.id) throw new Error(uploaded?.message ?? 'Upload failed');

      const linkRes = await fetch(`/api/documents/${uploaded.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
        body: JSON.stringify({ entityType: 'ACCOUNT', entityId: accountId }),
      });
      if (!linkRes.ok) {
        const body = (await linkRes.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'Uploaded, but linking to the account failed');
      }

      toast.success('Document uploaded.');
      setOpen(false);
      setFile(null);
      setCategoryId(NO_CATEGORY);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4" aria-hidden /> Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>Uploads a file and links it to this account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="file">File</Label>
              <input
                id="file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="flex h-9 w-full rounded-md border border-input bg-background text-sm shadow-brand-sm file:mr-3 file:h-full file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
