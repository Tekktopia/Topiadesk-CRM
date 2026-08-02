'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { ACCOUNT_STATUSES, RISK_RATINGS, accountStatusLabel, accountStatusVariant, riskRatingLabel, riskRatingVariant } from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import { useAccounts, useDeleteAccount } from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { Account, AccountQuery } from '../../_lib/types';
import { AccountFormDialog } from './account-form-dialog';
import { ConfirmDialog } from '../../_components/confirm-dialog';

const UNSET = '__any';

export function AccountsListView() {
  const { user } = useCurrentUser();
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>(UNSET);
  const [riskRating, setRiskRating] = React.useState<string>(UNSET);
  const [industryId, setIndustryId] = React.useState('');
  const [mineOnly, setMineOnly] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [deleting, setDeleting] = React.useState<Account | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query: AccountQuery = {
    q: debouncedSearch || undefined,
    status: status === UNSET ? undefined : (status as AccountQuery['status']),
    riskRating: riskRating === UNSET ? undefined : (riskRating as AccountQuery['riskRating']),
    industryId: industryId || undefined,
    ownerId: mineOnly && user ? user.id : undefined,
    take: 100,
  };

  const { data, isLoading, isFetching } = useAccounts(query);
  const deleteAccount = useDeleteAccount();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Client and prospect organizations your team manages."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New account
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="account-search">
              Search
            </label>
            <Input
              id="account-search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {ACCOUNT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {accountStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Risk rating</label>
            <Select value={riskRating} onValueChange={setRiskRating}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any risk</SelectItem>
                {RISK_RATINGS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {riskRatingLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="account-industry">
              Industry ID
            </label>
            <Input
              id="account-industry"
              placeholder="Optional UUID"
              value={industryId}
              onChange={(e) => setIndustryId(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              disabled={!user}
            />
            My accounts only
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data || data.length === 0 ? (
            <EmptyState
              title="No accounts match these filters"
              description="Try clearing a filter, or create a new account to get started."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New account
                </Button>
              }
            />
          ) : (
            <div className="relative">
              {isFetching ? (
                <Loader2 className="absolute right-0 top-0 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium text-foreground">
                        <Link href={`/accounts/${account.id}`} className="hover:underline">
                          {account.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {account.accountType === 'CORPORATE' ? 'Corporate' : 'Individual'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={accountStatusVariant(account.status)}>{accountStatusLabel(account.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={riskRatingVariant(account.riskRating)}>{riskRatingLabel(account.riskRating)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[account.city, account.country].filter(Boolean).join(', ') || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(account.createdAt)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Account actions">
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(account)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleting(account)}
                            >
                              <Trash2 aria-hidden /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AccountFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <AccountFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} account={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the account. This cannot be undone."
        confirmLabel="Delete account"
        destructive
        isPending={deleteAccount.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteAccount.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
