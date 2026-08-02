'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@topiadesk/ui';
import { Download, FileText, Link2Off } from 'lucide-react';
import { formatDate } from '@/app/(policy)/lib/format';
import { UploadDocumentDialog } from '@/app/(policy)/documents/upload-document-dialog';

interface PolicyDocumentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  linkId: string;
  linkedAt: string;
  currentVersion: { versionNumber: number } | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Documents linked to this policy — see app/api/policies/:id/documents's
 * comment for how "linked to this policy" is composed (there's no direct
 * backend reverse-lookup endpoint). */
export function DocumentsPanel({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();
  const documentsQuery = useQuery({
    queryKey: ['policy-documents', policyId],
    queryFn: () => fetchJson<PolicyDocumentRow[]>(`/api/policies/${policyId}/documents`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['policy-documents', policyId] });

  async function unlink(linkId: string) {
    try {
      const res = await fetch(`/api/documents/links/${linkId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unlink document');
      toast.success('Document unlinked.');
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink document');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <UploadDocumentDialog linkToPolicyId={policyId} onUploaded={invalidate} />
      </div>

      {documentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : documentsQuery.isError ? (
        <p className="text-sm text-destructive">Couldn&apos;t load documents.</p>
      ) : !documentsQuery.data || documentsQuery.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents linked to this policy yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Linked</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentsQuery.data.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {doc.fileName}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatBytes(doc.sizeBytes)}</TableCell>
                <TableCell className="text-muted-foreground">v{doc.currentVersion?.versionNumber ?? 1}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(doc.linkedAt)}</TableCell>
                <TableCell className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" asChild title="Download">
                    <a href={`/api/documents/${doc.id}/download`} download>
                      <Download className="h-4 w-4" aria-hidden />
                    </a>
                  </Button>
                  <Button size="icon" variant="ghost" title="Unlink from this policy" onClick={() => void unlink(doc.linkId)}>
                    <Link2Off className="h-4 w-4" aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
