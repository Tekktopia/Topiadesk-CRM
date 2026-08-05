'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Skeleton } from '@topiadesk/ui';
import { formatCurrency } from '../../_lib/format';
import { useQuotaAttainment } from '../../_lib/hooks';

/** target-vs-actual, backed by GET /crm/sales-quotas/:id/attainment (real wonAmount sum over won Opportunities in the quota's period/scope/lineOfBusiness) — never computed client-side from raw opportunity rows. */
export function SalesQuotaAttainmentDialog({
  open,
  onOpenChange,
  quotaId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotaId: string | undefined;
}) {
  const { data, isLoading } = useQuotaAttainment(quotaId);
  const pct = data ? Math.min(100, Math.max(0, data.attainmentPct)) : 0;
  const isOver = (data?.attainmentPct ?? 0) >= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attainment</DialogTitle>
          <DialogDescription>Won opportunity amount against this quota&apos;s target, for its period and scope.</DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={isOver ? 'h-full bg-success' : 'h-full bg-primary'}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-foreground">{formatCurrency(data.wonAmount)}</span>
              <span className="text-muted-foreground">of {formatCurrency(data.targetAmount)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{data.attainmentPct}% attained</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
