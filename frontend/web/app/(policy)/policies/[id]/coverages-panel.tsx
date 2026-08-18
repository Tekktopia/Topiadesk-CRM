'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { formatNaira } from '@/app/(policy)/lib/format';
import type { PolicyCoverageDto } from '@/app/(policy)/lib/types';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { csrfHeaders } from '@/lib/csrf';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** FSC's InsurancePolicyCoverage — this policy's coverage lines (name/type/sum insured/premium/deductible/limits). */
export function CoveragesPanel({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PolicyCoverageDto | null>(null);
  const [deleting, setDeleting] = React.useState<PolicyCoverageDto | null>(null);

  const coveragesQuery = useQuery({
    queryKey: ['policy-coverages', policyId],
    queryFn: () => fetchJson<PolicyCoverageDto[]>(`/api/policies/${policyId}/coverages`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['policy-coverages', policyId] });

  const deleteCoverage = useMutation({
    mutationFn: (coverageId: string) =>
      fetch(`/api/policies/${policyId}/coverages/${coverageId}`, { method: 'DELETE', credentials: 'same-origin', headers: csrfHeaders('DELETE') }),
    onSuccess: () => {
      toast.success('Coverage removed');
      invalidate();
      setDeleting(null);
    },
    onError: () => toast.error('Failed to remove coverage'),
  });

  if (coveragesQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading coverages…</p>;
  if (coveragesQuery.isError) return <p className="text-sm text-destructive">Couldn&apos;t load coverages.</p>;

  return (
    <>
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add coverage
        </Button>
      </div>

      {(coveragesQuery.data ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No coverages recorded for this policy yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coverage</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Sum insured</TableHead>
              <TableHead className="text-right">Premium</TableHead>
              <TableHead className="text-right">Deductible</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(coveragesQuery.data ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-foreground">{c.coverageName}</TableCell>
                <TableCell className="text-muted-foreground">{c.coverageType}</TableCell>
                <TableCell className="text-right tabular-nums">{c.sumInsured ? formatNaira(c.sumInsured) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{c.premium ? formatNaira(c.premium) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{c.deductible ? formatNaira(c.deductible) : '—'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Coverage actions">
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(c)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(c)}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CoverageFormDialog open={createOpen} onOpenChange={setCreateOpen} policyId={policyId} onSaved={invalidate} />
      {editing ? (
        <CoverageFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          policyId={policyId}
          coverage={editing}
          onSaved={invalidate}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove "${deleting?.coverageName}"?`}
        confirmLabel="Remove"
        destructive
        isPending={deleteCoverage.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteCoverage.mutate(deleting.id);
        }}
      />
    </>
  );
}

function CoverageFormDialog({
  open,
  onOpenChange,
  policyId,
  coverage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  coverage?: PolicyCoverageDto;
  onSaved: () => void;
}) {
  const isEdit = Boolean(coverage);
  const [coverageName, setCoverageName] = React.useState('');
  const [coverageType, setCoverageType] = React.useState('');
  const [sumInsured, setSumInsured] = React.useState('');
  const [premium, setPremium] = React.useState('');
  const [deductible, setDeductible] = React.useState('');
  const [limits, setLimits] = React.useState('');
  const [subLimits, setSubLimits] = React.useState('');
  const [conditions, setConditions] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setCoverageName(coverage?.coverageName ?? '');
      setCoverageType(coverage?.coverageType ?? '');
      setSumInsured(coverage?.sumInsured ?? '');
      setPremium(coverage?.premium ?? '');
      setDeductible(coverage?.deductible ?? '');
      setLimits(coverage?.limits ?? '');
      setSubLimits(coverage?.subLimits ?? '');
      setConditions(coverage?.conditions ?? '');
    }
  }, [open, coverage]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        coverageName,
        coverageType,
        sumInsured: sumInsured || undefined,
        premium: premium || undefined,
        deductible: deductible || undefined,
        limits: limits || undefined,
        subLimits: subLimits || undefined,
        conditions: conditions || undefined,
      };
      const url = isEdit ? `/api/policies/${policyId}/coverages/${coverage!.id}` : `/api/policies/${policyId}/coverages`;
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders(method) },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to save coverage');
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Coverage updated' : 'Coverage added');
      onSaved();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save coverage'),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coverageName.trim() || !coverageType.trim()) {
      toast.error('Coverage name and type are required');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit coverage' : 'Add coverage'}</DialogTitle>
            <DialogDescription>A line of cover on this policy — e.g. Comprehensive, Third Party, All Risks.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="coverage-name">Coverage name</Label>
              <Input id="coverage-name" value={coverageName} onChange={(e) => setCoverageName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-type">Coverage type</Label>
              <Input id="coverage-type" placeholder="Comprehensive, Third Party…" value={coverageType} onChange={(e) => setCoverageType(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-sum-insured">Sum insured</Label>
              <Input id="coverage-sum-insured" inputMode="decimal" value={sumInsured} onChange={(e) => setSumInsured(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-premium">Premium</Label>
              <Input id="coverage-premium" inputMode="decimal" value={premium} onChange={(e) => setPremium(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-deductible">Deductible</Label>
              <Input id="coverage-deductible" inputMode="decimal" value={deductible} onChange={(e) => setDeductible(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-limits">Limits</Label>
              <Input id="coverage-limits" value={limits} onChange={(e) => setLimits(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-sub-limits">Sub-limits</Label>
              <Input id="coverage-sub-limits" value={subLimits} onChange={(e) => setSubLimits(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="coverage-conditions">Conditions</Label>
              <Input id="coverage-conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Add coverage'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
