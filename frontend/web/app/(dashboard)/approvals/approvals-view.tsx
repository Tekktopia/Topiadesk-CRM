'use client';

import * as React from 'react';
import { CheckCircle2, Clock, FileClock, Inbox, UserRoundCog, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  GradientStatTile,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useApprovalDelegations, useApprovalHistory, usePendingApprovals, useRevokeApprovalDelegation } from '../dashboard-hooks';
import type { ApprovalDelegation, PendingApproval } from '../types';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ApprovalListCard, ENTITY_TYPE_LABELS, OVERDUE_DAYS, ageInDays } from './approval-row';
import { DelegationFormDialog } from './delegation-form-dialog';

const ALL_TYPES = '__all';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function ApprovalsView() {
  const { user } = useCurrentUser();
  const pendingQuery = usePendingApprovals();
  const delegationsQuery = useApprovalDelegations();
  const [activeTab, setActiveTab] = React.useState('waiting');
  const historyQuery = useApprovalHistory(activeTab === 'history');
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const rows = pendingQuery.data ?? [];
  const toDecide = rows.filter((r) => !r.isMine);
  const mine = rows.filter((r) => r.isMine);
  const oldestWaiting = toDecide.length > 0 ? Math.max(...toDecide.map((r) => ageInDays(r.createdAt))) : null;

  const delegations = delegationsQuery.data ?? [];
  const activeDelegationCount = delegations.filter((d) => d.isActive).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Approvals"
        description="Every pending approval across the app in one place — case closures, policy endorsements &amp; cancellations, knowledge articles, role changes, and workflow gates. Deciding still happens on the record itself; this is where you find it."
        actions={
          <Button variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5">
            <UserRoundCog className="h-4 w-4" aria-hidden />
            Delegate my approvals
          </Button>
        }
      />

      {pendingQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-[104px] w-full rounded-lg" />
          <Skeleton className="h-[104px] w-full rounded-lg" />
          <Skeleton className="h-[104px] w-full rounded-lg" />
        </div>
      ) : pendingQuery.isError ? null : (
        <div className="grid gap-4 sm:grid-cols-3">
          <GradientStatTile accent="violet" label="Waiting on you" value={toDecide.length} icon={<Inbox />} description="you can act on these" />
          <GradientStatTile accent="navy" label="Your requests" value={mine.length} icon={<Clock />} description="pending someone else's decision" />
          <GradientStatTile
            accent="teal"
            label="Oldest waiting"
            value={oldestWaiting === null ? '—' : `${oldestWaiting}d`}
            icon={<FileClock />}
            description={oldestWaiting === null ? 'nothing waiting' : oldestWaiting >= OVERDUE_DAYS ? 'getting old — worth a look' : 'since it was requested'}
          />
        </div>
      )}

      {pendingQuery.isError ? (
        <ErrorState error={pendingQuery.error} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="waiting">Waiting on you{toDecide.length > 0 ? ` (${toDecide.length})` : ''}</TabsTrigger>
            <TabsTrigger value="mine">Your requests{mine.length > 0 ? ` (${mine.length})` : ''}</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="delegation">Delegation{activeDelegationCount > 0 ? ` (${activeDelegationCount})` : ''}</TabsTrigger>
          </TabsList>

          <TabsContent value="waiting" className="pt-4">
            <ApprovalTabPanel
              items={toDecide}
              variant="pending"
              emptyIcon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
              emptyTitle="Nothing waiting on you"
              emptyDescription="New approval requests will show up here."
            />
          </TabsContent>

          <TabsContent value="mine" className="pt-4">
            <ApprovalTabPanel
              items={mine}
              variant="pending"
              emptyTitle="No requests pending"
              emptyDescription={`Approvals you${user ? `, ${user.fullName},` : ''} submit and are still waiting on someone else will show up here.`}
            />
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            {historyQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : historyQuery.isError ? (
              <ErrorState error={historyQuery.error} />
            ) : (
              <ApprovalTabPanel
                items={historyQuery.data ?? []}
                variant="history"
                emptyTitle="No decisions yet"
                emptyDescription="Approved and rejected requests will show up here once something's been decided."
              />
            )}
          </TabsContent>

          <TabsContent value="delegation" className="pt-4">
            <DelegationSection currentUserId={user?.id} delegations={delegations} isLoading={delegationsQuery.isLoading} />
          </TabsContent>
        </Tabs>
      )}

      <DelegationFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ApprovalTabPanel({
  items,
  variant,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  items: PendingApproval[];
  variant: 'pending' | 'history';
  emptyIcon?: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [search, setSearch] = React.useState('');
  const [entityType, setEntityType] = React.useState<string>(ALL_TYPES);

  const availableTypes = React.useMemo(() => Array.from(new Set(items.map((i) => i.entityType))), [items]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (entityType !== ALL_TYPES && item.entityType !== entityType) return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || Boolean(item.reason?.toLowerCase().includes(q)) || Boolean(item.requestedByName?.toLowerCase().includes(q));
    });
  }, [items, search, entityType]);

  if (items.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Search by title, reason, or requester…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All types</SelectItem>
            {availableTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {ENTITY_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          {filtered.length} of {items.length}
        </p>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search term or type filter." />
      ) : (
        <ApprovalListCard items={filtered} variant={variant} />
      )}
    </div>
  );
}

function DelegationSection({
  currentUserId,
  delegations,
  isLoading,
}: {
  currentUserId: string | undefined;
  delegations: ApprovalDelegation[];
  isLoading: boolean;
}) {
  const revoke = useRevokeApprovalDelegation();
  const given = delegations.filter((d) => d.delegatorId === currentUserId);
  const received = delegations.filter((d) => d.delegateId === currentUserId && d.delegatorId !== currentUserId);

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (given.length === 0 && received.length === 0) {
    return (
      <EmptyState
        icon={<UserRoundCog className="h-8 w-8" aria-hidden />}
        title="No delegations set up"
        description="While you're out, hand your named-approver workflow gates to a colleague using the button above."
      />
    );
  }

  return (
    <div className="space-y-4">
      {given.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Given by you</h3>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {given.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm text-foreground">
                      To <span className="font-medium">{d.delegateName ?? 'a colleague'}</span>
                      <Badge variant={d.isActive ? 'success' : 'outline'} className="ml-2">
                        {d.isActive ? 'Active' : 'Scheduled'}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(d.startsAt)} – {formatDate(d.endsAt)}
                      {d.note ? ` · ${d.note}` : ''}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => revoke.mutate(d.id)} disabled={revoke.isPending} aria-label="Revoke delegation">
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {received.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Standing in for others</h3>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {received.map((d) => (
                <div key={d.id} className="px-4 py-3">
                  <p className="text-sm text-foreground">
                    Standing in for <span className="font-medium">{d.delegatorName ?? 'a colleague'}</span>
                    <Badge variant={d.isActive ? 'success' : 'outline'} className="ml-2">
                      {d.isActive ? 'Active' : 'Scheduled'}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(d.startsAt)} – {formatDate(d.endsAt)}
                    {d.note ? ` · ${d.note}` : ''}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
