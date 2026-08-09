'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Award, Loader2, Minus, Pencil, Plus, Settings2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@topiadesk/ui';
import { ChangeTierDialog } from '../../../_components/change-tier-dialog';
import { EmptyState } from '../../../_components/empty-state';
import { formatDate } from '../../../_lib/format';
import {
  useAdjustPoints,
  useEarnPoints,
  useEnrollLoyaltyAccount,
  useLoyaltyAccountByAccountId,
  useLoyaltyTransactions,
  useRedeemPoints,
} from '../../../_lib/hooks';
import type { LoyaltyTransaction } from '../../../_lib/types';

const TRANSACTION_TYPE_VARIANT: Record<LoyaltyTransaction['type'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  EARN: 'default',
  REDEEM: 'secondary',
  ADJUST: 'outline',
  EXPIRE: 'destructive',
};

export function LoyaltyTab({ accountId }: { accountId: string }) {
  const { data: loyaltyAccount, isLoading } = useLoyaltyAccountByAccountId(accountId);
  const enroll = useEnrollLoyaltyAccount();
  const [dialogMode, setDialogMode] = React.useState<'earn' | 'redeem' | 'adjust' | null>(null);
  const [tierDialogOpen, setTierDialogOpen] = React.useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!loyaltyAccount) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            title="Not enrolled in the loyalty program"
            description="Enroll this account to start earning and redeeming points."
            action={
              <Button onClick={() => enroll.mutate(accountId)} disabled={enroll.isPending}>
                {enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Enroll in loyalty program
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile label="Points balance" value={loyaltyAccount.pointsBalance.toLocaleString()} icon={<Award />} />
        <div className="flex items-center gap-2 rounded-none border border-border p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tier</span>
          <Badge variant="secondary" className="ml-auto">
            {loyaltyAccount.tier}
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Change tier" onClick={() => setTierDialogOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-none border border-border p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Enrolled</span>
          <span className="ml-auto text-sm text-foreground">{formatDate(loyaltyAccount.enrolledAt)}</span>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Ledger</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialogMode('earn')}>
              <Plus aria-hidden /> Earn
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialogMode('redeem')}>
              <Minus aria-hidden /> Redeem
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialogMode('adjust')}>
              <Settings2 aria-hidden /> Adjust
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TransactionHistory loyaltyAccountId={loyaltyAccount.id} />
        </CardContent>
      </Card>

      {dialogMode ? (
        <PostPointsDialog
          mode={dialogMode}
          open={Boolean(dialogMode)}
          onOpenChange={(open) => setDialogMode(open ? dialogMode : null)}
          loyaltyAccountId={loyaltyAccount.id}
          accountId={accountId}
        />
      ) : null}

      {tierDialogOpen ? (
        <ChangeTierDialog
          open={tierDialogOpen}
          onOpenChange={setTierDialogOpen}
          loyaltyAccountId={loyaltyAccount.id}
          accountId={accountId}
          currentTier={loyaltyAccount.tier}
        />
      ) : null}
    </div>
  );
}

function TransactionHistory({ loyaltyAccountId }: { loyaltyAccountId: string }) {
  const { data, isLoading } = useLoyaltyTransactions(loyaltyAccountId);

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data || data.length === 0) {
    return <EmptyState title="No transactions yet" description="Earn or redeem points to see the ledger here." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Points</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Posted by</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((txn) => (
          <TableRow key={txn.id}>
            <TableCell>
              <Badge variant={TRANSACTION_TYPE_VARIANT[txn.type]}>{txn.type}</Badge>
            </TableCell>
            <TableCell className={txn.points < 0 ? 'text-destructive' : 'text-foreground'}>
              {txn.points > 0 ? '+' : ''}
              {txn.points.toLocaleString()}
            </TableCell>
            <TableCell className="max-w-xs truncate">{txn.reason}</TableCell>
            <TableCell>{txn.createdByName ?? '—'}</TableCell>
            <TableCell>{formatDate(txn.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const postPointsSchema = z.object({
  points: z.coerce.number().int().positive('Must be a positive number'),
  reason: z.string().min(1, 'Reason is required'),
});

type PostPointsValues = z.infer<typeof postPointsSchema>;

const DIALOG_COPY: Record<'earn' | 'redeem' | 'adjust', { title: string; description: string; submitLabel: string; pointsLabel: string }> = {
  earn: { title: 'Earn points', description: 'Grant points for a bind, renewal, or other qualifying activity.', submitLabel: 'Post earn', pointsLabel: 'Points to earn' },
  redeem: { title: 'Redeem points', description: 'Redeem points against a reward. Posts as a negative ledger entry.', submitLabel: 'Post redemption', pointsLabel: 'Points to redeem' },
  adjust: { title: 'Adjust points', description: 'Manual correction — requires a department head or above.', submitLabel: 'Post adjustment', pointsLabel: 'Points (use a negative number to claw back)' },
};

function PostPointsDialog({
  mode,
  open,
  onOpenChange,
  loyaltyAccountId,
  accountId,
}: {
  mode: 'earn' | 'redeem' | 'adjust';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loyaltyAccountId: string;
  accountId: string;
}) {
  const form = useForm<PostPointsValues>({ resolver: zodResolver(postPointsSchema), defaultValues: { points: 0, reason: '' } });
  const earn = useEarnPoints();
  const redeem = useRedeemPoints();
  const adjust = useAdjustPoints();
  const mutation = mode === 'earn' ? earn : mode === 'redeem' ? redeem : adjust;
  const copy = DIALOG_COPY[mode];

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync({ loyaltyAccountId, accountId, points: values.points, reason: values.reason });
    form.reset({ points: 0, reason: '' });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="points"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.pointsLabel}</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Policy renewal bonus" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {copy.submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
