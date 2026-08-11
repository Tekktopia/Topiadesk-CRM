'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Send, Ban } from 'lucide-react';
import {
  Badge,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { formatDate } from '@/app/(policy)/lib/format';
import type { PolicyDocumentRow } from '@/app/api/policies/[id]/documents/route';

interface SignatureRequest {
  id: string;
  documentId: string;
  signerName: string;
  signerEmail: string;
  status: 'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED' | 'EXPIRED';
  sentAt: string;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function statusVariant(status: SignatureRequest['status']): 'outline' | 'warning' | 'success' | 'destructive' {
  if (status === 'SIGNED') return 'success';
  if (status === 'DECLINED' || status === 'EXPIRED') return 'destructive';
  if (status === 'VIEWED') return 'warning';
  return 'outline';
}

/**
 * E-signature requests for this policy's documents — a DocuSign envelope
 * per row (see SignatureRequest's schema comment; the actual send is
 * stubbed, no live DocuSign credentials in this environment — see
 * esignature.service.ts). Only documents already linked to this policy
 * (DocumentsPanel's own list) can be picked as the signing target — the
 * backend enforces this too, this dropdown is just the honest reflection
 * of that constraint.
 */
export function SignaturesPanel({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();
  const [sendOpen, setSendOpen] = React.useState(false);
  const [documentId, setDocumentId] = React.useState('');
  const [signerName, setSignerName] = React.useState('');
  const [signerEmail, setSignerEmail] = React.useState('');

  const requestsQuery = useQuery({
    queryKey: ['policy-signature-requests', policyId],
    queryFn: () => fetchJson<SignatureRequest[]>(`/api/policies/${policyId}/signature-requests`),
  });
  const documentsQuery = useQuery({
    queryKey: ['policy-documents', policyId],
    queryFn: () => fetchJson<PolicyDocumentRow[]>(`/api/policies/${policyId}/documents`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['policy-signature-requests', policyId] });

  const sendMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/policies/${policyId}/signature-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, signerName, signerEmail }),
      }).then((res) => {
        if (!res.ok) throw new Error('Failed to send for signature');
        return res.json();
      }),
    onSuccess: () => {
      toast.success('Sent for signature');
      setSendOpen(false);
      setDocumentId('');
      setSignerName('');
      setSignerEmail('');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to send for signature'),
  });

  const voidMutation = useMutation({
    mutationFn: (requestId: string) =>
      fetch(`/api/policies/${policyId}/signature-requests/${requestId}/void`, { method: 'POST' }).then((res) => {
        if (!res.ok) throw new Error('Failed to void request');
      }),
    onSuccess: () => {
      toast.success('Request voided');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to void request'),
  });

  const canSubmit = documentId && signerName.trim() && signerEmail.trim();
  const documentsById = new Map((documentsQuery.data ?? []).map((d) => [d.id, d]));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setSendOpen(true)} disabled={!documentsQuery.data || documentsQuery.data.length === 0}>
          <Send className="h-4 w-4" aria-hidden /> Send for signature
        </Button>
      </div>

      {requestsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading signature requests…</p>
      ) : requestsQuery.isError ? (
        <p className="text-sm text-destructive">Couldn&apos;t load signature requests.</p>
      ) : !requestsQuery.data || requestsQuery.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No signature requests yet. {(!documentsQuery.data || documentsQuery.data.length === 0) && 'Link a document to this policy first (see the Documents tab).'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Signer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requestsQuery.data.map((req) => (
              <TableRow key={req.id}>
                <TableCell>
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <FileSignature className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {documentsById.get(req.documentId)?.fileName ?? req.documentId}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {req.signerName} <span className="text-xs">({req.signerEmail})</span>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(req.sentAt)}</TableCell>
                <TableCell className="text-right">
                  {req.status === 'SENT' || req.status === 'VIEWED' ? (
                    <Button size="icon" variant="ghost" title="Void request" onClick={() => voidMutation.mutate(req.id)}>
                      <Ban className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send for signature</DialogTitle>
            <DialogDescription>The signer receives an email with a link to review and sign the document.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Document</Label>
              <Select value={documentId} onValueChange={setDocumentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a linked document" />
                </SelectTrigger>
                <SelectContent>
                  {(documentsQuery.data ?? []).map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.fileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signer-name">Signer name</Label>
              <Input id="signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="e.g. Adaeze Nwankwo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signer-email">Signer email</Label>
              <Input id="signer-email" type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="signer@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSubmit || sendMutation.isPending} onClick={() => sendMutation.mutate()}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
