'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@topiadesk/ui';
import { Download, FileText, Link2Off } from 'lucide-react';
import { formatDate } from '../../_lib/format';
import { csrfHeaders } from '@/lib/csrf';
import { CarrierUploadDocumentDialog } from './carrier-upload-document-dialog';

interface CarrierDocumentRow {
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

/** Documents linked to this carrier — mirrors app/(policy)/policies/[id]/documents-panel.tsx's
 * shape exactly, pointed at app/api/crm/carriers/:id/documents instead (same
 * "no backend reverse-lookup, composed client-side" caveat that route's own
 * header comment documents). Local copy rather than a cross-route-group
 * import, same reasoning every other route group in this codebase gives for
 * not sharing these small view components. */
export function CarrierDocumentsPanel({ carrierId }: { carrierId: string }) {
  const queryClient = useQueryClient();
  const documentsQuery = useQuery({
    queryKey: ['carrier-documents', carrierId],
    queryFn: () => fetchJson<CarrierDocumentRow[]>(`/api/crm/carriers/${carrierId}/documents`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['carrier-documents', carrierId] });

  async function unlink(linkId: string) {
    try {
      const res = await fetch(`/api/documents/links/${linkId}`, { method: 'DELETE', headers: csrfHeaders('DELETE') });
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
        <CarrierUploadDocumentDialog carrierId={carrierId} onUploaded={invalidate} />
      </div>

      {documentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : documentsQuery.isError ? (
        <p className="text-sm text-destructive">Couldn&apos;t load documents.</p>
      ) : !documentsQuery.data || documentsQuery.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents linked to this carrier yet.</p>
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
                  <Button size="icon" variant="ghost" title="Unlink from this carrier" onClick={() => void unlink(doc.linkId)}>
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
