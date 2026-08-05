'use client';

import * as React from 'react';
import { ChevronDown, Loader2, Zap } from 'lucide-react';
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
} from '@topiadesk/ui';
import { macroActionTypeLabel } from '../../../_lib/constants';
import { useApplyMacroToClaim, useMacros, usePreviewMacroOnClaim } from '../../../_lib/hooks';
import type { MacroPreviewChange } from '../../../_lib/types';
import { EmptyState } from '../../../_components/empty-state';

/**
 * Claim-side counterpart of cases/[id]/_components/apply-macro-dropdown.tsx
 * — same preview-then-apply flow, against POST /claims/:id/apply-macro/:macroId
 * (which previously didn't exist: Macro.entityType has always supported
 * CLAIM in the schema, but there was no way to actually apply one to a
 * claim). Duplicated rather than generalized into a shared component — the
 * two entity types' hooks/query-invalidation are already separate
 * (useApplyMacroToCase vs useApplyMacroToClaim), matching this module's
 * existing convention of parallel Case/Claim implementations (e.g.
 * sla-clock.util.ts's ensureCaseSlaClocks/ensureClaimSlaClocks) rather than
 * one over-parameterized abstraction.
 */
export function ApplyMacroDropdown({ claimId }: { claimId: string }) {
  const { data: macros } = useMacros();
  const applicable = (macros ?? []).filter((m) => m.isActive && (m.entityType === 'CLAIM' || !m.entityType));
  const preview = usePreviewMacroOnClaim(claimId);
  const apply = useApplyMacroToClaim(claimId);
  const [pendingMacro, setPendingMacro] = React.useState<{ id: string; name: string } | null>(null);
  const [changes, setChanges] = React.useState<MacroPreviewChange[] | null>(null);

  async function selectMacro(id: string, name: string) {
    setPendingMacro({ id, name });
    setChanges(null);
    const result = await preview.mutateAsync(id).catch(() => null);
    if (result) setChanges(result.changes);
  }

  function confirmApply() {
    if (!pendingMacro) return;
    apply.mutate(pendingMacro.id, {
      onSuccess: () => {
        setPendingMacro(null);
        setChanges(null);
      },
    });
  }

  if (applicable.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Zap aria-hidden /> Apply macro <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {applicable.map((macro) => (
            <DropdownMenuItem key={macro.id} onSelect={() => void selectMacro(macro.id, macro.name)}>
              {macro.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={Boolean(pendingMacro)} onOpenChange={(open) => !open && setPendingMacro(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply &quot;{pendingMacro?.name}&quot;?</DialogTitle>
            <DialogDescription>This is what running the macro against this claim would change.</DialogDescription>
          </DialogHeader>

          {preview.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          ) : !changes || changes.length === 0 ? (
            <EmptyState title="No previewable changes" description="The macro may still take effect (e.g. an internal note or notification)." />
          ) : (
            <ul className="space-y-2 text-sm">
              {changes.map((change, i) => (
                <li key={i} className="rounded-md border border-border p-3">
                  <p className="font-medium text-foreground">{macroActionTypeLabel(change.actionType)}</p>
                  <p className="text-muted-foreground">{change.description}</p>
                  {change.currentValue !== undefined || change.newValue !== undefined ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(change.currentValue ?? '—')} → {String(change.newValue ?? '—')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button type="button" onClick={confirmApply} disabled={apply.isPending || preview.isPending}>
              {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Apply macro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
