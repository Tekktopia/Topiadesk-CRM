'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, History, ScrollText, ShieldCheck, ShieldEllipsis } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { AuditActionBadge } from '../_components/status-badge';
import { apiFetch } from '../_lib/api';
import { useUsers } from '../_lib/queries';
import type { AuditCheckpointDto, AuditLogDto, AuditVerifyResponseDto } from '../_lib/types';
import { AuditLogDetailDialog } from './audit-log-detail-dialog';
import { AuditVerifyResultDialog } from './audit-verify-result-dialog';
import { AuditCheckpointHistoryDialog } from './audit-checkpoint-history-dialog';

const UNSET = '__any';
const TAKE = 50;

// Hand-mirrored from packages/db/prisma/schema.prisma's AuditAction enum —
// same convention as e.g. admin/users/page.tsx's local STATUS_OPTIONS.
const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'PERMISSION_CHANGE', 'FORCE_LOGOUT', 'EXPORT', 'VIEW_SENSITIVE'] as const;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actorUserId, setActorUserId] = useState<string>(UNSET);
  const [action, setAction] = useState<string>(UNSET);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResponseDto | null>(null);
  const [checkpointHistoryOpen, setCheckpointHistoryOpen] = useState(false);

  const debouncedEntityType = useDebounced(entityType, 300);
  const debouncedEntityId = useDebounced(entityId, 300);

  const usersQuery = useUsers();

  // Any filter change invalidates the current page offset.
  useEffect(() => {
    setSkip(0);
  }, [debouncedEntityType, debouncedEntityId, actorUserId, action, from, to]);

  const qs = useMemo(() => {
    const params = new URLSearchParams({ take: String(TAKE), skip: String(skip) });
    if (debouncedEntityType) params.set('entityType', debouncedEntityType);
    if (debouncedEntityId) params.set('entityId', debouncedEntityId);
    if (actorUserId !== UNSET) params.set('actorUserId', actorUserId);
    if (action !== UNSET) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  }, [debouncedEntityType, debouncedEntityId, actorUserId, action, from, to, skip]);

  const auditLogQuery = useQuery({
    queryKey: ['admin', 'audit-log', qs],
    queryFn: () => apiFetch<AuditLogDto[]>(`/api/admin/audit-log?${qs}`),
  });

  const rows = auditLogQuery.data ?? [];
  const hasNextPage = rows.length === TAKE;

  // Checkpoints are written every ~5 min by backend/worker's
  // audit-checkpoint/create-checkpoint.job.ts (one per active tenant) —
  // the most recent one lets "Verify since last checkpoint" recompute
  // hashes over only the last few minutes of rows instead of the whole
  // table, same incremental design 003_audit_checkpoint.sql documents.
  const checkpointsQuery = useQuery({
    queryKey: ['admin', 'audit-log', 'checkpoints'],
    queryFn: () => apiFetch<AuditCheckpointDto[]>('/api/admin/audit-log/checkpoints'),
  });
  const latestCheckpoint = checkpointsQuery.data?.[0];

  const verifyMutation = useMutation({
    mutationFn: (fromCheckpointId?: string) =>
      apiFetch<AuditVerifyResponseDto>(
        `/api/admin/audit-log/verify${fromCheckpointId ? `?fromCheckpointId=${fromCheckpointId}` : ''}`,
      ),
    onSuccess: setVerifyResult,
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to verify the audit chain'),
  });

  function handleExport(format: 'csv' | 'ndjson') {
    const params = new URLSearchParams({ format });
    if (debouncedEntityType) params.set('entityType', debouncedEntityType);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.location.href = `/api/admin/audit-log/export?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Every compliance-relevant mutation, hash-chained and structurally append-only. Visible here only to ADMIN and COMPLIANCE_OFFICER — the API enforces this independently of what this page shows."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCheckpointHistoryOpen(true)}>
              <History className="h-4 w-4" aria-hidden /> Checkpoints
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => verifyMutation.mutate(latestCheckpoint?.id)}
              disabled={verifyMutation.isPending || checkpointsQuery.isLoading}
              title={latestCheckpoint ? `Since ${new Date(latestCheckpoint.checkpointAt).toLocaleString()}` : 'No checkpoint yet — verifies from genesis'}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden /> {verifyMutation.isPending ? 'Verifying…' : 'Verify since checkpoint'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => verifyMutation.mutate(undefined)} disabled={verifyMutation.isPending}>
              <ShieldEllipsis className="h-4 w-4" aria-hidden /> Verify full history
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[160px] flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-entity-type">
            Entity type
          </label>
          <Input
            id="audit-entity-type"
            placeholder="e.g. policies, accounts…"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          />
        </div>
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-entity-id">
            Entity ID
          </label>
          <Input
            id="audit-entity-id"
            placeholder="UUID"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-48">
          <label className="text-xs font-medium text-muted-foreground">Actor</label>
          <Select value={actorUserId} onValueChange={setActorUserId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Any actor</SelectItem>
              {(usersQuery.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-44">
          <label className="text-xs font-medium text-muted-foreground">Action</label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Any action</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-from">
            From
          </label>
          <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-to">
            To
          </label>
          <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
      </div>

      {auditLogQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : auditLogQuery.isError ? (
        <ErrorState error={auditLogQuery.error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No audit entries match these filters"
          icon={<ScrollText className="h-8 w-8" aria-hidden />}
          description={skip === 0 ? 'Try clearing a filter.' : undefined}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-none border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={entry.id} className="cursor-pointer" onClick={() => setSelected(entry)}>
                    <TableCell className="text-sm text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-foreground">
                      {entry.actorUser?.fullName ?? entry.actorSystemJob ?? '—'}
                    </TableCell>
                    <TableCell>
                      <AuditActionBadge action={entry.action} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="text-foreground">{entry.entityType}</span>{' '}
                      <span className="font-mono text-xs">{entry.entityId}</span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(entry)}>
                        View details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {skip + 1}–{skip + rows.length}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - TAKE))}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!hasNextPage} onClick={() => setSkip(skip + TAKE)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <AuditLogDetailDialog entry={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />

      <AuditVerifyResultDialog result={verifyResult} open={!!verifyResult} onOpenChange={(open) => !open && setVerifyResult(null)} />

      <AuditCheckpointHistoryDialog
        checkpoints={checkpointsQuery.data ?? []}
        isLoading={checkpointsQuery.isLoading}
        open={checkpointHistoryOpen}
        onOpenChange={setCheckpointHistoryOpen}
      />
    </div>
  );
}
