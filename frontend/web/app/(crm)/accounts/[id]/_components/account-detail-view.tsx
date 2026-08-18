'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArchiveRestore,
  ArrowRightLeft,
  Briefcase,
  Building2,
  CalendarClock,
  CheckSquare,
  FileText,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Receipt,
  ShieldAlert,
  Sparkles,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import {
  ActivityTimeline,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GaugeChart,
  GradientStatTile,
  RecordHistory,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import {
  accountStatusLabel,
  accountStatusVariant,
  accountTypeLabel,
  claimStatusLabel,
  claimStatusVariant,
  healthScoreLabel,
  healthScoreVariant,
  kycStatusLabel,
  kycStatusVariant,
  relationshipTypeLabel,
  relationshipTypeVariant,
  riskRatingLabel,
  riskRatingVariant,
  taskPriorityLabel,
  taskPriorityVariant,
  taskStatusLabel,
  taskStatusVariant,
} from '../../../_lib/constants';
import { formatCurrency, formatDate, fullName, initials } from '../../../_lib/format';
import { renewalStatusVariant } from '@/app/(policy)/lib/format';
import { useCan, useSlaPolicies } from '@/app/(cases)/_lib/hooks';
import type { SlaPolicy } from '@/app/(cases)/_lib/types';
import {
  useAccount,
  useAccountClaims,
  useAccountGroupRollup,
  useAccountRelationships,
  useAccountRenewals,
  useAccountSlaOverrides,
  useAllPipelineStages,
  useContacts,
  useCreateDataSubjectRequest,
  useCreateActivity,
  useActivities,
  useDeleteAccount,
  useDeleteAccountRelationship,
  useDeleteContact,
  useDeleteSite,
  useDirectoryUsers,
  useIndustry,
  useOpportunities,
  useRemoveAccountSlaOverride,
  useRestoreAccount,
  useSites,
  useTasksForEntity,
  useUpsertAccountSlaOverride,
} from '../../../_lib/hooks';
import type { AccountDetail, AccountRelationship, Contact, Site } from '../../../_lib/types';
import { AccountFormDialog } from '../../_components/account-form-dialog';
import { AccountRelationshipFormDialog } from '../../_components/account-relationship-form-dialog';
import { ContactFormDialog } from '../../_components/contact-form-dialog';
import { ConsentDialog } from './consent-dialog';
import { SiteFormDialog } from '../../_components/site-form-dialog';
import { AccountDocumentsPanel } from './account-documents-panel';
import { AccountRelationshipGraph } from './account-relationship-graph';
import { AiInsightPanel } from './ai-insight-panel';
import { LoyaltyTab } from './loyalty-tab';
import { TransferOwnerDialog } from './transfer-owner-dialog';

export function AccountDetailView({ accountId }: { accountId: string }) {
  const router = useRouter();
  const canWrite = useCan('account', 'write');
  const { data: account, isLoading } = useAccount(accountId);
  const { data: groupRollup } = useAccountGroupRollup(accountId);
  const { usersById } = useDirectoryUsers();
  const { data: industry } = useIndustry(account?.industryId ?? undefined);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const deleteAccount = useDeleteAccount();
  const restoreAccount = useRestoreAccount();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
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

  const owner = usersById.get(account.ownerId);

  return (
    <div className="space-y-6">
      {account.isArchived ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">This account is archived — hidden from the default list and read-only in most views.</p>
          <Button size="sm" variant="outline" onClick={() => restoreAccount.mutate(account.id)} disabled={restoreAccount.isPending}>
            <ArchiveRestore aria-hidden /> Restore
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-gradient-to-r from-brand-700 to-navy-700 p-6 text-white">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 border-2 border-white/30">
            <AvatarFallback className="bg-white/15 text-lg font-semibold text-white">{initials(account.name)}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
              <Badge variant={accountStatusVariant(account.status)}>{accountStatusLabel(account.status)}</Badge>
              <Badge variant={riskRatingVariant(account.riskRating)}>{riskRatingLabel(account.riskRating)} risk</Badge>
              <Badge variant={kycStatusVariant(account.kycStatus)}>KYC {kycStatusLabel(account.kycStatus)}</Badge>
              <Badge variant={healthScoreVariant(account.healthScore)}>Health {healthScoreLabel(account.healthScore)}</Badge>
            </div>
            <p className="text-sm text-white/80">
              {accountTypeLabel(account.accountType)} account · {[account.city, account.country].filter(Boolean).join(', ') || 'No location on file'}
              {owner ? ` · Owned by ${owner.fullName}` : null}
            </p>
            {account.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {account.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-white/30 bg-white/10 font-normal text-white">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)} disabled={!canWrite} title={!canWrite ? 'You do not have permission to edit accounts' : undefined}>
            <Pencil aria-hidden /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Account actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
                <ArrowRightLeft aria-hidden /> Transfer ownership
              </DropdownMenuItem>
              {account.isArchived ? (
                <DropdownMenuItem onSelect={() => restoreAccount.mutate(account.id)}>
                  <ArchiveRestore aria-hidden /> Restore account
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Archive account
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GradientStatTile accent="blue" label="Total sum insured" value={formatCurrency(account.financials.totalSumInsured)} icon={<Wallet />} />
        <GradientStatTile accent="teal" label="Outstanding premium" value={formatCurrency(account.financials.totalOutstandingPremium)} icon={<Receipt />} />
        <GradientStatTile accent="violet" label="Won opportunity value" value={formatCurrency(account.financials.wonOpportunityValue)} icon={<Trophy />} />
        <Card className="flex items-center justify-center p-0">
          <GaugeChart label="Health score" valuePercent={account.healthScore ?? 0} height={110} />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Contacts" value={account.counts.contacts} icon={<Users />} />
        <StatTile label="Opportunities" value={account.counts.opportunities} icon={<Briefcase />} />
        <StatTile label="Tasks" value={account.counts.tasks} icon={<CheckSquare />} />
        <StatTile label="Policies" value={account.counts.policies} icon={<ShieldCheck />} />
        <StatTile label="Activities" value={account.counts.activities} icon={<ActivityIcon />} />
        <StatTile label="Relationships" value={account.counts.relationships} icon={<Network />} />
      </div>

      {/* Group Premium Rollup — this account's parent/subsidiary tree
          combined (FSC's "Corporate Client Page... Group Premium Rollup",
          Household's "Total Premium"). Only shown once there's an actual
          group beyond this single account — a leaf account with no parent
          or subsidiaries would just duplicate the financials row above. */}
      {groupRollup && groupRollup.accountCount > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Group rollup</CardTitle>
            <CardDescription>
              Combined across this account and {groupRollup.accountCount - 1} {groupRollup.accountCount - 1 === 1 ? 'subsidiary' : 'subsidiaries'} in its hierarchy.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Accounts in group" value={groupRollup.accountCount} icon={<Network />} />
            <StatTile label="Group policies" value={groupRollup.totalPolicies} icon={<ShieldCheck />} />
            <StatTile label="Group sum insured" value={formatCurrency(groupRollup.totalSumInsured)} icon={<Wallet />} />
            <StatTile label="Group gross premium" value={formatCurrency(groupRollup.totalGrossPremium)} icon={<Receipt />} />
            <StatTile label="Open claims" value={groupRollup.openClaims} icon={<AlertTriangle />} />
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="sites" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" aria-hidden /> Sites
          </TabsTrigger>
          <TabsTrigger value="relationships" className="gap-1.5">
            <Network className="h-3.5 w-3.5" aria-hidden /> Relationships
          </TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="renewals" className="gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Renewals
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" aria-hidden /> Documents
          </TabsTrigger>
          <TabsTrigger value="claims" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Claims
          </TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
          <TabsTrigger value="ai-insights" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI Insights
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Account type" value={accountTypeLabel(account.accountType)} />
              <Field label="Status" value={accountStatusLabel(account.status)} />
              <Field label="Risk rating" value={riskRatingLabel(account.riskRating)} />
              <Field
                label="Health score"
                value={account.healthScoreComputedAt ? `${healthScoreLabel(account.healthScore)} · as of ${formatDate(account.healthScoreComputedAt)}` : healthScoreLabel(account.healthScore)}
              />
              <Field label="City" value={account.city ?? '—'} />
              <Field label="State" value={account.state ?? '—'} />
              <Field label="Country" value={account.country ?? '—'} />
              <Field label="Industry" value={industry?.name ?? (account.industryId ? '—' : 'Not set')} />
              <Field label="Owner" value={owner?.fullName ?? account.ownerId} mono={!owner} />
              <Field label="Source" value={account.source ?? '—'} />
              <Field label="KYC status" value={kycStatusLabel(account.kycStatus)} />
              <Field label="KYC expiry" value={account.kycExpiryDate ? formatDate(account.kycExpiryDate) : '—'} />
              <Field label="NAICOM ID" value={account.naicomId ?? '—'} />
              <Field label="Created" value={formatDate(account.createdAt)} />
              <Field label="Last updated" value={formatDate(account.updatedAt)} />
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Notes" value={account.notes ?? '—'} />
              </div>
            </CardContent>
          </Card>

          <SlaOverridesCard accountId={accountId} />
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="sites">
          <SitesTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="relationships">
          <RelationshipsTab account={account} />
        </TabsContent>

        <TabsContent value="opportunities">
          <OpportunitiesTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="renewals">
          <RenewalsTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountDocumentsPanel accountId={accountId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claims">
          <ClaimsTab accountId={accountId} />
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
              <RecordHistory entityType="accounts" entityId={accountId} fetchUrl={`/api/crm/accounts/${accountId}/history`} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AccountFormDialog open={editOpen} onOpenChange={setEditOpen} account={account} />
      <TransferOwnerDialog open={transferOpen} onOpenChange={setTransferOpen} accountId={accountId} currentOwnerId={account.ownerId} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Archive "${account.name}"?`}
        description="Archived accounts are hidden from the default list but can be restored at any time — nothing is permanently deleted."
        confirmLabel="Archive account"
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
  const createDsr = useCreateDataSubjectRequest();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [deleting, setDeleting] = React.useState<Contact | null>(null);
  const [dsrTarget, setDsrTarget] = React.useState<{ contact: Contact; requestType: 'EXPORT' | 'DELETE' } | null>(null);
  const [consentTarget, setConsentTarget] = React.useState<Contact | null>(null);

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
                  <TableCell className="font-medium text-foreground">
                    <span className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">{initials(fullName(contact.firstName, contact.lastName))}</AvatarFallback>
                      </Avatar>
                      {fullName(contact.firstName, contact.lastName)}
                      {contact.householdRole ? (
                        <Badge variant="outline" className="font-normal">
                          {contact.householdRole}
                        </Badge>
                      ) : null}
                      {contact.anonymizedAt ? (
                        <Badge variant="secondary" className="font-normal">
                          Data erased
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
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
                        <DropdownMenuItem onSelect={() => setConsentTarget(contact)}>Manage consent</DropdownMenuItem>
                        {!contact.anonymizedAt ? (
                          <>
                            <DropdownMenuItem onSelect={() => setDsrTarget({ contact, requestType: 'EXPORT' })}>
                              Request data export
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDsrTarget({ contact, requestType: 'DELETE' })}>
                              Request data deletion
                            </DropdownMenuItem>
                          </>
                        ) : null}
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
      <ConfirmDialog
        open={Boolean(dsrTarget)}
        onOpenChange={(open) => !open && setDsrTarget(null)}
        title={
          dsrTarget?.requestType === 'DELETE'
            ? `Log a data deletion request for ${fullName(dsrTarget.contact.firstName, dsrTarget.contact.lastName)}?`
            : `Log a data export request for ${dsrTarget ? fullName(dsrTarget.contact.firstName, dsrTarget.contact.lastName) : ''}?`
        }
        description={
          dsrTarget?.requestType === 'DELETE'
            ? "This only logs the request as PENDING — nothing is erased yet. A compliance reviewer fulfills it from Data Requests, which anonymizes this contact's name/email/phone/ID fields in place (their case/policy history stays intact)."
            : 'This only logs the request as PENDING — a compliance reviewer fulfills it from Data Requests, producing a point-in-time export of everything on file for this contact.'
        }
        confirmLabel="Log request"
        destructive={dsrTarget?.requestType === 'DELETE'}
        isPending={createDsr.isPending}
        onConfirm={() => {
          if (!dsrTarget) return;
          createDsr.mutate(
            { contactId: dsrTarget.contact.id, requestType: dsrTarget.requestType },
            { onSuccess: () => setDsrTarget(null) },
          );
        }}
      />
      {consentTarget ? <ConsentDialog contact={consentTarget} open={Boolean(consentTarget)} onOpenChange={(open) => !open && setConsentTarget(null)} /> : null}
    </Card>
  );
}

function SitesTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useSites(accountId);
  const deleteSite = useDeleteSite(accountId);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Site | null>(null);
  const [deleting, setDeleting] = React.useState<Site | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Sites</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> Add site
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No sites yet" description="Add a branch or location for corporate clients with more than one address." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium text-foreground">{site.name}</TableCell>
                  <TableCell className="text-muted-foreground">{site.addressLine1 ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{site.city ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{site.state ?? '—'}</TableCell>
                  <TableCell>{site.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Site actions">
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(site)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(site)}>
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

      <SiteFormDialog open={createOpen} onOpenChange={setCreateOpen} accountId={accountId} />
      {editing ? (
        <SiteFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} accountId={accountId} site={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove "${deleting?.name}"?`}
        confirmLabel="Remove site"
        destructive
        isPending={deleteSite.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteSite.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </Card>
  );
}

function RelationshipsTab({ account }: { account: AccountDetail }) {
  const { data, isLoading } = useAccountRelationships(account.id);
  const deleteRelationship = useDeleteAccountRelationship(account.id);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountRelationship | null>(null);
  const [deleting, setDeleting] = React.useState<AccountRelationship | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Hierarchy &amp; relationships</CardTitle>
          <CardDescription>The account&apos;s parent/subsidiary structure and lateral links to other accounts, at a glance.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountRelationshipGraph account={account} relationships={data ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Relationships</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> Add relationship
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data || data.length === 0 ? (
            <EmptyState title="No relationships yet" description="Link this account to a referral source, competitor, joint venture, or other related account." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Related account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((rel) => {
                  const isA = rel.accountAId === account.id;
                  const otherId = isA ? rel.accountBId : rel.accountAId;
                  const otherName = isA ? rel.accountBName : rel.accountAName;
                  return (
                    <TableRow key={rel.id}>
                      <TableCell className="font-medium text-foreground">
                        <Link href={`/accounts/${otherId}`} className="hover:underline">
                          {otherName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={relationshipTypeVariant(rel.relationshipType)}>{relationshipTypeLabel(rel.relationshipType)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rel.notes ?? '—'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Relationship actions">
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(rel)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(rel)}>
                              <Trash2 aria-hidden /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AccountRelationshipFormDialog open={createOpen} onOpenChange={setCreateOpen} accountId={account.id} />
      {editing ? (
        <AccountRelationshipFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          accountId={account.id}
          relationship={editing}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this relationship?"
        confirmLabel="Remove relationship"
        destructive
        isPending={deleteRelationship.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteRelationship.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
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

const NO_OVERRIDE = '__default';

/**
 * Pins this account to a specific SLA policy per entity type, instead of
 * the usual caseType/priority-based resolution — resolveSlaPolicy()
 * (backend sla-clock.util.ts) checks AccountSlaOverride first. Visible to
 * anyone who can view the account (same as sla-policies-list-view.tsx,
 * which never checks 'read' either — the session's own `permissions` list
 * only ever carries 'write' grants, per useCan's header comment, so a
 * 'read' check here would always evaluate false and hide the card for
 * everyone); the two Selects are disabled (not hidden) without write, so a
 * read-only viewer can still see what's configured.
 */
function SlaOverridesCard({ accountId }: { accountId: string }) {
  const canWrite = useCan('sla_config', 'write');
  const { data: overrides } = useAccountSlaOverrides(accountId);
  const { data: casePolicies } = useSlaPolicies('CASE');
  const { data: claimPolicies } = useSlaPolicies('CLAIM');
  const upsert = useUpsertAccountSlaOverride(accountId);
  const remove = useRemoveAccountSlaOverride(accountId);

  const caseOverride = overrides?.find((o) => o.entityType === 'CASE');
  const claimOverride = overrides?.find((o) => o.entityType === 'CLAIM');

  function handleChange(entityType: 'CASE' | 'CLAIM', value: string) {
    if (value === NO_OVERRIDE) {
      remove.mutate(entityType);
    } else {
      upsert.mutate({ entityType, slaPolicyId: value });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA overrides</CardTitle>
        <CardDescription>
          Pin this account to a specific SLA policy instead of the one normally resolved by ticket type/priority — e.g. a faster tier for a VIP client.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SlaOverrideSelect
          label="Ticket SLA policy"
          value={caseOverride?.slaPolicyId ?? NO_OVERRIDE}
          policies={casePolicies ?? []}
          disabled={!canWrite}
          onChange={(value) => handleChange('CASE', value)}
        />
        <SlaOverrideSelect
          label="Claim SLA policy"
          value={claimOverride?.slaPolicyId ?? NO_OVERRIDE}
          policies={claimPolicies ?? []}
          disabled={!canWrite}
          onChange={(value) => handleChange('CLAIM', value)}
        />
      </CardContent>
    </Card>
  );
}

function SlaOverrideSelect({
  label,
  value,
  policies,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  policies: SlaPolicy[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_OVERRIDE}>Default (resolved automatically)</SelectItem>
          {policies.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RenewalsTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useAccountRenewals(accountId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renewals</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No policies yet" description="Every policy on this account, with its renewal status, will show up here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy</TableHead>
                <TableHead>Policy status</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Renewal status</TableHead>
                <TableHead>Renewal due</TableHead>
                <TableHead>Next alert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.policyId}>
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/policies/${row.policyId}`} className="hover:underline">
                      {row.policyNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.policyStatus}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.expiryDate)}</TableCell>
                  <TableCell>
                    {row.renewalStatus ? (
                      <Badge variant={renewalStatusVariant(row.renewalStatus)}>{row.renewalStatus.replace(/_/g, ' ')}</Badge>
                    ) : (
                      <span className="text-muted-foreground">No schedule</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.renewalDueDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.nextAlertDueAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Claim has no direct accountId FK (Claim -> Policy -> Account) — the join is stitched server-side by GET /crm/accounts/:id/claims, not client-filtered here. */
function ClaimsTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useAccountClaims(accountId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claims</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No claims yet" description="Claims filed against any policy on this account will show up here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Policy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Date of loss</TableHead>
                <TableHead>Reserve</TableHead>
                <TableHead>Settled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className="font-medium text-foreground">{claim.claimNumber}</TableCell>
                  <TableCell>
                    <Link href={`/policies/${claim.policyId}`} className="text-muted-foreground hover:underline">
                      {claim.policyNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={claimStatusVariant(claim.status)}>{claimStatusLabel(claim.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={taskPriorityVariant(claim.priority)}>{taskPriorityLabel(claim.priority)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(claim.dateOfLoss)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatCurrency(claim.reserveAmount)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatCurrency(claim.settledAmount)}</TableCell>
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
    authorName: a.createdById ? (usersById.get(a.createdById)?.fullName ?? null) : null,
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
