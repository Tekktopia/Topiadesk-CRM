'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { csrfHeaders } from '@/lib/csrf';

interface ApiKey {
  id: string;
  name: string;
  tokenLastFour: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Self-service API keys — a bearer token an external script/integration
 * uses to call this same REST API as the signed-in user, under their own
 * live permissions (see ApiKey's schema.prisma comment for why revoking
 * the person's roles narrows/revokes the key too, automatically). No admin
 * involvement needed to create or revoke one — that's the "self-service"
 * part — so this lives on the personal Profile page, not under /admin.
 */
export function ApiKeysCard() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKey | null>(null);

  const keysQuery = useQuery({
    queryKey: ['auth', 'api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/auth/api-keys');
      if (!res.ok) throw new Error('Failed to load API keys');
      return (await res.json()) as ApiKey[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: { name: string }) => {
      const res = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to create API key');
      return (await res.json()) as ApiKey & { token: string };
    },
    onSuccess: (data) => {
      setCreatedKey(data.token);
      setName('');
      queryClient.invalidateQueries({ queryKey: ['auth', 'api-keys'] });
    },
    onError: () => toast.error('Couldn’t create API key'),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/auth/api-keys/${id}`, { method: 'DELETE', headers: csrfHeaders('DELETE') });
      if (!res.ok) throw new Error('Failed to revoke API key');
    },
    onSuccess: () => {
      toast.success('API key revoked');
      setPendingRevoke(null);
      queryClient.invalidateQueries({ queryKey: ['auth', 'api-keys'] });
    },
    onError: () => toast.error('Couldn’t revoke API key'),
  });

  function handleCopy() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function closeCreateDialog(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setCreatedKey(null);
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
            API keys
          </CardTitle>
          <CardDescription>For scripts and external integrations to call the TopiaDesk API as you.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New key
        </Button>
      </CardHeader>
      <CardContent>
        {keysQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !keysQuery.data || keysQuery.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keysQuery.data.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium text-foreground">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">tdk_…{key.tokenLastFour}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(key.lastUsedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={key.isActive ? 'success' : 'outline'}>{key.isActive ? 'Active' : 'Revoked'}</Badge>
                  </TableCell>
                  <TableCell>
                    {key.isActive ? (
                      <Button variant="ghost" size="icon" aria-label={`Revoke ${key.name}`} onClick={() => setPendingRevoke(key)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={closeCreateDialog}>
        <DialogContent>
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Copy your key now</DialogTitle>
                <DialogDescription>This is the only time it&apos;s shown — TopiaDesk never stores it in a readable form.</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2.5">
                <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{createdKey}</code>
                <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy key">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => closeCreateDialog(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New API key</DialogTitle>
                <DialogDescription>It will act with your own current permissions — revoking your access later revokes the key too.</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="api-key-name">Name</Label>
                <Input id="api-key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapier integration" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => closeCreateDialog(false)}>
                  Cancel
                </Button>
                <Button disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate({ name: name.trim() })}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Create key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingRevoke)} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke &quot;{pendingRevoke?.name}&quot;?</DialogTitle>
            <DialogDescription>Anything using this key will immediately stop working. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => pendingRevoke && revokeMutation.mutate(pendingRevoke.id)}
            >
              {revokeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
