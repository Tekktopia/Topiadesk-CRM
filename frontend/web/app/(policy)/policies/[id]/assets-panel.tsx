'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
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
import { assetTypeLabel, formatNaira } from '@/app/(policy)/lib/format';
import { ASSET_TYPES, type AssetType, type PolicyAssetDto } from '@/app/(policy)/lib/types';
import { ConfirmDialog } from '../../_components/confirm-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** FSC's InsurancePolicyAsset — the insured item(s) on this policy (vehicle, property, cargo, vessel). */
export function AssetsPanel({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PolicyAssetDto | null>(null);
  const [deleting, setDeleting] = React.useState<PolicyAssetDto | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['policy-assets', policyId],
    queryFn: () => fetchJson<PolicyAssetDto[]>(`/api/policies/${policyId}/assets`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['policy-assets', policyId] });

  const deleteAsset = useMutation({
    mutationFn: (assetId: string) => fetch(`/api/policies/${policyId}/assets/${assetId}`, { method: 'DELETE', credentials: 'same-origin' }),
    onSuccess: () => {
      toast.success('Asset removed');
      invalidate();
      setDeleting(null);
    },
    onError: () => toast.error('Failed to remove asset'),
  });

  if (assetsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading assets…</p>;
  if (assetsQuery.isError) return <p className="text-sm text-destructive">Couldn&apos;t load assets.</p>;

  return (
    <>
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add asset
        </Button>
      </div>

      {(assetsQuery.data ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No insured items recorded for this policy yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Registration / Chassis</TableHead>
              <TableHead className="text-right">Valuation</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(assetsQuery.data ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium text-foreground">
                  {a.assetName}
                  {a.makeModel ? <span className="ml-2 text-xs text-muted-foreground">{a.makeModel}{a.year ? ` (${a.year})` : ''}</span> : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{assetTypeLabel(a.assetType)}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{a.registrationNo ?? a.chassisNo ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{a.valuation ? formatNaira(a.valuation) : '—'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Asset actions">
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(a)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(a)}>
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

      <AssetFormDialog open={createOpen} onOpenChange={setCreateOpen} policyId={policyId} onSaved={invalidate} />
      {editing ? (
        <AssetFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          policyId={policyId}
          asset={editing}
          onSaved={invalidate}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove "${deleting?.assetName}"?`}
        confirmLabel="Remove"
        destructive
        isPending={deleteAsset.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteAsset.mutate(deleting.id);
        }}
      />
    </>
  );
}

function AssetFormDialog({
  open,
  onOpenChange,
  policyId,
  asset,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  asset?: PolicyAssetDto;
  onSaved: () => void;
}) {
  const isEdit = Boolean(asset);
  const [assetType, setAssetType] = React.useState<AssetType>('VEHICLE');
  const [assetName, setAssetName] = React.useState('');
  const [registrationNo, setRegistrationNo] = React.useState('');
  const [chassisNo, setChassisNo] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [valuation, setValuation] = React.useState('');
  const [year, setYear] = React.useState('');
  const [makeModel, setMakeModel] = React.useState('');
  const [latitude, setLatitude] = React.useState('');
  const [longitude, setLongitude] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setAssetType(asset?.assetType ?? 'VEHICLE');
      setAssetName(asset?.assetName ?? '');
      setRegistrationNo(asset?.registrationNo ?? '');
      setChassisNo(asset?.chassisNo ?? '');
      setAddress(asset?.address ?? '');
      setValuation(asset?.valuation ?? '');
      setYear(asset?.year != null ? String(asset.year) : '');
      setMakeModel(asset?.makeModel ?? '');
      setLatitude(asset?.latitude ?? '');
      setLongitude(asset?.longitude ?? '');
    }
  }, [open, asset]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        assetType,
        assetName,
        registrationNo: registrationNo || undefined,
        chassisNo: chassisNo || undefined,
        address: address || undefined,
        valuation: valuation || undefined,
        year: year ? Number(year) : undefined,
        makeModel: makeModel || undefined,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
      };
      const url = isEdit ? `/api/policies/${policyId}/assets/${asset!.id}` : `/api/policies/${policyId}/assets`;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to save asset');
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Asset updated' : 'Asset added');
      onSaved();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save asset'),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetName.trim()) {
      toast.error('Asset name is required');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit asset' : 'Add asset'}</DialogTitle>
            <DialogDescription>The insured item on this policy — vehicle, property, cargo, or vessel.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Asset type</Label>
              <Select value={assetType} onValueChange={(v) => setAssetType(v as AssetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {assetTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">Asset name</Label>
              <Input id="asset-name" value={assetName} onChange={(e) => setAssetName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-registration">Registration no.</Label>
              <Input id="asset-registration" value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-chassis">Chassis no.</Label>
              <Input id="asset-chassis" value={chassisNo} onChange={(e) => setChassisNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-make-model">Make / model</Label>
              <Input id="asset-make-model" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-year">Year</Label>
              <Input id="asset-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-valuation">Valuation</Label>
              <Input id="asset-valuation" inputMode="decimal" value={valuation} onChange={(e) => setValuation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-address">Address</Label>
              <Input id="asset-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-latitude">Latitude</Label>
              <Input id="asset-latitude" inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-longitude">Longitude</Label>
              <Input id="asset-longitude" inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Add asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
