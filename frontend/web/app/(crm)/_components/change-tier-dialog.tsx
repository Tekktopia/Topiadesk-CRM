'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { useUpdateLoyaltyTier } from '../_lib/hooks';

const TIER_PRESETS = ['STANDARD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
const CUSTOM_TIER = '__custom__';

/** Shared by the account Loyalty tab and the org-wide /loyalty list — both
 * just need to move one account to a different tier via the existing
 * PATCH /loyalty-accounts/:id/tier. Tier is a plain string (no
 * tier-config model), so presets are suggestions, not a closed set. */
export function ChangeTierDialog({
  open,
  onOpenChange,
  loyaltyAccountId,
  accountId,
  currentTier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loyaltyAccountId: string;
  accountId: string;
  currentTier: string;
}) {
  const isPreset = (TIER_PRESETS as readonly string[]).includes(currentTier);
  const [selection, setSelection] = React.useState<string>(isPreset ? currentTier : CUSTOM_TIER);
  const [customTier, setCustomTier] = React.useState(isPreset ? '' : currentTier);
  const updateTier = useUpdateLoyaltyTier();

  const nextTier = selection === CUSTOM_TIER ? customTier.trim() : selection;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change tier</DialogTitle>
          <DialogDescription>Move this account to a different loyalty tier.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={selection} onValueChange={setSelection}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIER_PRESETS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_TIER}>Custom…</SelectItem>
            </SelectContent>
          </Select>
          {selection === CUSTOM_TIER ? (
            <Input placeholder="Custom tier name" value={customTier} onChange={(e) => setCustomTier(e.target.value)} />
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={updateTier.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={updateTier.isPending || !nextTier}
            onClick={() =>
              updateTier.mutate({ loyaltyAccountId, accountId, tier: nextTier }, { onSuccess: () => onOpenChange(false) })
            }
          >
            {updateTier.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save tier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
