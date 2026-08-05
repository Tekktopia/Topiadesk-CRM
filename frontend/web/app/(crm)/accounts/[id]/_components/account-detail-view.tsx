'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity as ActivityIcon,
  Briefcase,
  CheckSquare,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Sparkles,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import {
  ActivityTimeline,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RecordHistory,
  Skeleton,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ActivityTimelineItem,
  type LogActivityFormValues,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../../_components/confirm-dialog';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import {
  accountStatusLabel,
  accountStatusVariant,
  riskRatingLabel,
  riskRatingVariant,
  taskPriorityLabel,
  taskPriorityVariant,
  taskStatusLabel,
  taskStatusVariant,
} from '../../../_lib/constants';
import { formatCurrency, formatDate, fullName } from '../../../_lib/format';
import {
  useAccount,
  useAllPipelineStages,
  useContacts,
  useCreateActivity,
  useActivities,
  useDeleteAccount,
  useDeleteContact,
  useDirectoryUsers,
  useOpportunities,
  useTasksForEntity,
} from '../../../_lib/hooks';
import type { Contact } from '../../../_lib/types';
import { AccountFormDialog } from '../../_components/account-form-dialog';
import { ContactFormDialog } from '../../_components/contact-form-dialog';
import { AiInsightPanel } from './ai-insight-panel';
import { LoyaltyTab } from './loyalty-tab';

export function AccountDetailView({ accountId }: { accountId: string }) {
  const router = useRouter();
  const { data: account, isLoading } = useAccount(accountId);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const deleteAccount = useDeleteAccount();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!account) {
    return <EmptyState title="Account not found" description="It may have been deleted, or you may not have access to it." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {account.name}
            <Badge variant={accountStatusVariant(account.status)}>{accountStatusLabel(account.status)}</Badge>
            <Badge variant={riskRatingVariant(account.riskRating)}>{riskRatingLabel(account.riskRating)} risk</Badge>
          </span>
        }
        description={`${account.accountType === 'CORPORATE' ? 'Corporate' : 'Individual'} account · ${[account.city, account.country].filter(Boolean).join(', ') || 'No location on file'}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Contacts" value={account.counts.contacts} icon={<Users />} />
        <StatTile label="Opportunities" value={account.counts.opportunities} icon={<Briefcase />} />
        <StatTile label="Tasks" value={account.counts.tasks} icon={<CheckSquare />} />
        <StatTile label="Policies" value={account.counts.policies} icon={<ShieldCheck />} />
        <StatTile label="Activities" value={account.counts.activities} icon={<ActivityIcon />} />
        <StatTile label="Relationships" value={account.counts.relationships} icon={<Network />} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
          <TabsTrigger value="ai-insights" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI Insights
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Account type" value={account.accountType === 'CORPORATE' ? 'Corporate' : 'Individual'} />
              <Field label="Status" value={accountStatusLabel(account.status)} />
              <Field label="Risk rating" value={riskRatingLabel(account.riskRating)} />
              <Field label="City" value={account.city ?? '—'} />
              <Field label="Country" value={account.country ?? '—'} />
              <Field label="Industry ID" value={account.industryId ?? '—'} mono />
              <Field label="Owner ID" value={account.ownerId} mono />
              <Field label="Created" value={formatDate(account.createdAt)} />
              <Field label="Last updated" value={formatDate(account.updatedAt)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="opportunities">
          <OpportunitiesTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="loyalty">
          <LoyaltyTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="ai-insights">
          <AiInsightPanel accountId={accountId} accountName={account.name} />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordHistory entityType="accounts" entityId={accountId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AccountFormDialog open={editOpen} onOpenChange={setEditOpen} account={account} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${account.name}"?`}
        description="This permanently removes the account and cannot be undone."
        confirmLabel="Delete account"
        destructive
        isPending={deleteAccount.isPending}
        onConfirm={() =>
          deleteAccount.mutate(account.id, {
            onSuccess: () => router.push('/accounts'),
          })
        }
      />
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? 'font-mono text-xs text-foreground' : 'text-foreground'}>{value}</p>
    </div>
  );
}

function ContactsTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useContacts({ accountId });
  const deleteContact = useDeleteContact(accountId);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [deleting, setDeleting] = React.useState<Contact | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Contacts</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> Add contact
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No contacts yet" description="Add the people at this account your team works with." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium text-foreground">{fullName(contact.firstName, contact.lastName)}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.title ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.phone ?? '—'}</TableCell>
                  <TableCell>{contact.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Contact actions">
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(contact)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(contact)}>
                          <Trash2 aria-hidden /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ContactFormDialog open={createOpen} onOpenChange={setCreateOpen} accountId={accountId} />
      {editing ? (
        <ContactFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          accountId={accountId}
          contact={editing}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove ${deleting ? fullName(deleting.firstName, deleting.lastName) : ''}?`}
        confirmLabel="Remove contact"
        destructive
        isPending={deleteContact.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteContact.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </Card>
  );
}

function OpportunitiesTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useOpportunities({ accountId });
  const { stagesById } = useAllPipelineStages();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Opportunities</CardTitle>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/opportunities?accountId=${accountId}`}>Open in pipeline</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No opportunities yet" description="Opportunities created for this account will show up here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Probability</TableHead>
                <TableHead>Expected close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((opp) => {
                const stage = stagesById.get(opp.pipelineStageId);
                return (
                  <TableRow key={opp.id}>
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/opportunities/${opp.id}`} className="hover:underline">
                        {opp.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={stage?.isWon ? 'success' : stage?.isLost ? 'destructive' : 'outline'}>
                        {stage ? stage.name : '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatCurrency(opp.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{opp.probability}%</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(opp.expectedCloseDate)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TasksTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useTasksForEntity({ accountId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : data.length === 0 ? (
          <EmptyState title="No tasks yet" description="Tasks linked to this account will show up here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium text-foreground">{task.title}</TableCell>
                  <TableCell>
                    <Badge variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={taskPriorityVariant(task.priority)}>{taskPriorityLabel(task.priority)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(task.dueDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useActivities({ accountId });
  const { usersById } = useDirectoryUsers();
  const createActivity = useCreateActivity(['crm', 'activities']);

  const items: ActivityTimelineItem[] = (data ?? []).map((a) => ({
    id: a.id,
    type: a.type,
    direction: a.direction,
    subject: a.subject,
    body: a.body,
    occurredAt: a.occurredAt,
    durationMinutes: a.durationMinutes,
    outcome: a.outcome,
    authorName: usersById.get(a.createdById)?.fullName ?? null,
  }));

  async function handleLogActivity(values: LogActivityFormValues) {
    await createActivity.mutateAsync({
      accountId,
      type: values.type,
      direction: values.direction,
      subject: values.subject,
      body: values.body || undefined,
      occurredAt: new Date(values.occurredAt).toISOString(),
      durationMinutes: values.durationMinutes ? Number(values.durationMinutes) : undefined,
      outcome: values.outcome || undefined,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ActivityTimeline
          items={items}
          isLoading={isLoading}
          onLogActivity={handleLogActivity}
          isLogging={createActivity.isPending}
        />
      </CardContent>
    </Card>
  );
}
