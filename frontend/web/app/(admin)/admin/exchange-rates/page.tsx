'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import { useExchangeRates } from '../_lib/queries';
import type { ExchangeRateDto } from '../_lib/types';

/**
 * Multi-currency admin — one rate per non-NGN currency an Opportunity might
 * be quoted in (NGN itself is the implicit base, rate always 1, never has
 * a row — see ExchangeRate's schema.prisma comment). Read by dashboards.
 * controller.ts's pipeline/forecast/trend sums to normalize mixed-currency
 * totals before adding them together.
 */
export default function ExchangeRatesPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [currencyCode, setCurrencyCode] = useState('');
  const [rateToBase, setRateToBase] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ExchangeRateDto | null>(null);

  const ratesQuery = useExchangeRates();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'exchange-rates'] });
  }

  const upsertMutation = useMutation({
    mutationFn: () =>
      apiFetch<ExchangeRateDto>('/api/admin/exchange-rates', {
        method: 'POST',
        body: JSON.stringify({ currencyCode, rateToBase: Number(rateToBase) }),
      }),
    onSuccess: () => {
      toast.success('Exchange rate saved');
      setCreateOpen(false);
      setCurrencyCode('');
      setRateToBase('');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save rate'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/admin/exchange-rates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Exchange rate removed');
      setPendingDelete(null);
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to remove rate'),
  });

  const rates = ratesQuery.data ?? [];
  const canSubmit = /^[A-Za-z]{3}$/.test(currencyCode) && Number(rateToBase) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exchange Rates"
        description="How many Naira one unit of each currency is worth — used to normalize mixed-currency pipeline/forecast totals on the dashboard. NGN itself needs no row (its rate is always 1)."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> Add rate
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="pt-6">
          {ratesQuery.isLoading ? null : ratesQuery.isError ? (
            <ErrorState error={ratesQuery.error} />
          ) : rates.length === 0 ? (
            <EmptyState
              icon={<Coins className="h-8 w-8" aria-hidden />}
              title="No exchange rates configured"
              description="Every Opportunity currently defaults to NGN. Add a rate once you start quoting business in another currency."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>1 unit = ₦</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>
                      <Badge variant="outline">{rate.currencyCode}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums font-medium text-foreground">
                      ₦{Number(rate.rateToBase).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(rate.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {canWrite ? (
                        <Button variant="ghost" size="icon" aria-label={`Remove ${rate.currencyCode}`} onClick={() => setPendingDelete(rate)}>
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
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add or update a rate</DialogTitle>
            <DialogDescription>Saving an existing currency code replaces its rate — this doesn&apos;t keep history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rate-currency">Currency code</Label>
              <Input
                id="rate-currency"
                maxLength={3}
                placeholder="e.g. USD"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate-value">1 unit in Naira</Label>
              <Input id="rate-value" type="number" min="0" step="0.01" placeholder="e.g. 1600" value={rateToBase} onChange={(e) => setRateToBase(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSubmit || upsertMutation.isPending} onClick={() => upsertMutation.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Remove ${pendingDelete?.currencyCode} rate?`}
        description="Opportunities already quoted in this currency keep their amounts — dashboard totals will fall back to treating it as 1:1 with NGN until a new rate is added."
        confirmLabel="Remove"
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
