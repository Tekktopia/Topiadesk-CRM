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
  DialogTrigger,
  Input,
  Label,
  toast,
} from '@topiadesk/ui';
import { History } from 'lucide-react';

/** Uploads a new version of an existing document (POST
 * /api/documents/:id/versions, multipart) — becomes the document's new
 * currentVersion, per DocumentsController.addVersion. */
export function AddVersionDialog({ documentId, fileName, onAdded }: { documentId: string; fileName: string; onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [changeNote, setChangeNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error('Choose a file');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (changeNote) formData.append('changeNote', changeNote);
      const res = await fetch(`/api/documents/${documentId}/versions`, { method: 'POST', body: formData });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to add version');
      toast.success('New version uploaded.');
      setOpen(false);
      setFile(null);
      setChangeNote('');
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add version');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Add new version">
          <History className="h-4 w-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New version of {fileName}</DialogTitle>
            <DialogDescription>Replaces the current version shown to viewers; the prior version stays in history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="versionFile">File</Label>
              <input
                id="versionFile"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="flex h-9 w-full rounded-md border border-input bg-background text-sm shadow-brand-sm file:mr-3 file:h-full file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="changeNote">Change note</Label>
              <Input id="changeNote" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="What changed?" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Uploading…' : 'Upload version'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
