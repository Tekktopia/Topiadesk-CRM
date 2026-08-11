'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, Plus, Trash2 } from 'lucide-react';
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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { EmptyState } from '../_components/query-states';
import { apiFetch } from '../_lib/api';
import { useFieldPermissionCatalog, useFieldPermissions } from '../_lib/queries';
import type { FieldPermissionDto, FieldPermissionVisibility } from '../_lib/types';

const RESOURCE_LABEL: Record<string, string> = { account: 'Account', contact: 'Contact', premium: 'Premium' };

function fieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Field-Level Security — a single role's per-field visibility overrides,
 * distinct from the resource-level grants table above (that's whole-table
 * access; this is one field on one resource, e.g. "hide Premium.
 * commissionRate from this role" — see FieldPermission's schema.prisma
 * comment for the full design). Colocated on the Roles page rather than a
 * new nav entry, same "extend the page an admin's already on" precedent as
 * the Microsoft SSO card on Integrations. Scoped to a small fixed field
 * catalog (FIELD_PERMISSION_CATALOG, backend/api/src/common/
 * field-permissions/) — not every field in the app, deliberately, per the
 * gap-analysis item's own proportionate-first-slice scoping.
 */
export function FieldPermissionsCard({ roleId, roleName, canWrite }: { roleId: string; roleName: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const catalogQuery = useFieldPermissionCatalog();
  const grantsQuery = useFieldPermissions(roleId);
  const [addOpen, setAddOpen] = useState(false);
  const [resource, setResource] = useState<string>('');
  const [fieldName, setFieldName] = useState<string>('');
  const [visibility, setVisibility] = useState<FieldPermissionVisibility>('HIDDEN');
  const [pendingDelete, setPendingDelete] = useState<FieldPermissionDto | null>(null);

  const fieldOptions = useMemo(() => catalogQuery.data?.[resource] ?? [], [catalogQuery.data, resource]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'field-permissions', roleId] });
  }

  const upsertMutation = useMutation({
    mutationFn: () =>
      apiFetch<FieldPermissionDto>('/api/admin/field-permissions', {
        method: 'POST',
        body: JSON.stringify({ roleId, resource, fieldName, visibility }),
      }),
    onSuccess: () => {
      toast.success('Field permission saved');
      setAddOpen(false);
      setResource('');
      setFieldName('');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save field permission'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/admin/field-permissions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Field permission removed');
      setPendingDelete(null);
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to remove field permission'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            Field-level security
          </CardTitle>
          <CardDescription>Hide or lock individual fields for {roleName} — separate from the resource-level grants above.</CardDescription>
        </div>
        {canWrite ? (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add restriction
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {grantsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !grantsQuery.data || grantsQuery.data.length === 0 ? (
          <EmptyState title="No field restrictions" description="Every field is fully visible and editable for this role by default." />
        ) : (
          <ul className="divide-y divide-border">
            {grantsQuery.data.map((fp) => (
              <li key={fp.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{RESOURCE_LABEL[fp.resource] ?? fp.resource}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{fieldLabel(fp.fieldName)}</span>
                  <Badge variant={fp.visibility === 'HIDDEN' ? 'destructive' : 'warning'} className="gap-1">
                    {fp.visibility === 'HIDDEN' ? <EyeOff className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
                    {fp.visibility === 'HIDDEN' ? 'Hidden' : 'Read-only'}
                  </Badge>
                </span>
                {canWrite ? (
                  <Button variant="ghost" size="icon" aria-label={`Remove restriction on ${fp.fieldName}`} onClick={() => setPendingDelete(fp)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restrict a field</DialogTitle>
            <DialogDescription>{roleName} will see this change on their very next request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Resource</Label>
              <Select
                value={resource}
                onValueChange={(v) => {
                  setResource(v);
                  setFieldName('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a resource" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(catalogQuery.data ?? {}).map((r) => (
                    <SelectItem key={r} value={r}>
                      {RESOURCE_LABEL[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Field</Label>
              <Select value={fieldName} onValueChange={setFieldName} disabled={!resource}>
                <SelectTrigger>
                  <SelectValue placeholder={resource ? 'Select a field' : 'Pick a resource first'} />
                </SelectTrigger>
                <SelectContent>
                  {fieldOptions.map((f) => (
                    <SelectItem key={f} value={f}>
                      {fieldLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as FieldPermissionVisibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIDDEN">Hidden — never returned to this role</SelectItem>
                  <SelectItem value="READ_ONLY">Read-only — visible, but can&apos;t be changed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!resource || !fieldName || upsertMutation.isPending} onClick={() => upsertMutation.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remove this field restriction?"
        description={
          pendingDelete
            ? `${roleName} will immediately regain full read/write access to ${RESOURCE_LABEL[pendingDelete.resource] ?? pendingDelete.resource}.${fieldLabel(pendingDelete.fieldName)}.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </Card>
  );
}
