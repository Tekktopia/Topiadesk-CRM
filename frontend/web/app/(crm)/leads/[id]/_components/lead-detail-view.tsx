'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Mail, MoreHorizontal, Pencil, Phone, Trash2 } from 'lucide-react';
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type ActivityTimelineItem,
  type LogActivityFormValues,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../../_components/confirm-dialog';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import { humanize, leadStatusLabel, leadStatusVariant, taskPriorityLabel, taskPriorityVariant, taskStatusLabel, taskStatusVariant } from '../../../_lib/constants';
import { formatDate, fullName } from '../../../_lib/format';
import {
  useActivities,
  useCreateActivity,
  useDeleteLead,
  useDirectoryUsers,
  useLead,
  useTasksForEntity,
} from '../../../_lib/hooks';
import { LeadConvertDialog } from '../../_components/lead-convert-dialog';
import { LeadFormDialog } from '../../_components/lead-form-dialog';
import { ScoreRing, leadScoreBandLabel } from '../../../_components/score-meter';

export function LeadDetailView({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { data: lead, isLoading } = useLead(leadId);
  const { usersById } = useDirectoryUsers();
  const [editOpen, setEditOpen] = React.useState(false);
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const deleteLead = useDeleteLead();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!lead) {
    return <EmptyState title="Lead not found" description="It may have been deleted." />;
  }

  const ownerName = lead.assignedToId ? (usersById.get(lead.assignedToId)?.fullName ?? 'Unknown') : 'Unassigned';

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {fullName(lead.firstName, lead.lastName)}
            <Badge variant={leadStatusVariant(lead.status)}>{leadStatusLabel(lead.status)}</Badge>
          </span>
        }
        description={lead.companyName ?? 'No company on file'}
        actions={
          <>
            {lead.status !== 'CONVERTED' ? (
              <Button onClick={() => setConvertOpen(true)}>
                <ArrowRightLeft aria-hidden /> Convert
              </Button>
            ) : lead.convertedAccountId ? (
              <Button variant="outline" asChild>
                <Link href={`/accounts/${lead.convertedAccountId}`}>View converted account</Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Lead actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete lead
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row sm:items-start">
          {/* Score leads the card: it is the single number that decides
              whether this lead gets worked today. */}
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <ScoreRing score={lead.score} ariaLabel={`Score ${lead.score} of 100`} />
            <span className="text-xs font-medium text-muted-foreground">{leadScoreBandLabel(lead.score)} lead</span>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            {/* mailto:/tel: rather than inert text — the two things anyone
                opens a lead to actually do. */}
            <div className="flex flex-wrap gap-2">
              {lead.email ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${lead.email}`}>
                    <Mail aria-hidden /> {lead.email}
                  </a>
                </Button>
              ) : null}
              {lead.phone ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${lead.phone}`}>
                    <Phone aria-hidden /> {lead.phone}
                  </a>
                </Button>
              ) : null}
              {!lead.email && !lead.phone ? (
                <p className="text-sm text-muted-foreground">No contact details on file.</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Source" value={humanize(lead.source)} />
              <Field label="Campaign" value={lead.sourceCampaign ?? '—'} />
              <Field label="Owner" value={ownerName} />
              <Field label="Company" value={lead.companyName ?? '—'} />
              <Field label="Created" value={formatDate(lead.createdAt)} />
              <Field label="Status" value={leadStatusLabel(lead.status)} />
            </div>

            {lead.qualificationNotes ? (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Qualification notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{lead.qualificationNotes}</p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <RelatedTasksCard leadId={leadId} />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityLog leadId={leadId} />
        </CardContent>
      </Card>

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <LeadConvertDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete lead "${fullName(lead.firstName, lead.lastName)}"?`}
        description="This permanently removes the lead. This cannot be undone."
        confirmLabel="Delete lead"
        destructive
        isPending={deleteLead.isPending}
        onConfirm={() =>
          deleteLead.mutate(lead.id, {
            onSuccess: () => router.push('/leads'),
          })
        }
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

function RelatedTasksCard({ leadId }: { leadId: string }) {
  const { data, isLoading } = useTasksForEntity({ leadId });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <EmptyState title="No tasks yet" description="Tasks linked to this lead will show up here." />
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

function ActivityLog({ leadId }: { leadId: string }) {
  const { data, isLoading } = useActivities({ leadId });
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
      leadId,
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
    <ActivityTimeline items={items} isLoading={isLoading} onLogActivity={handleLogActivity} isLogging={createActivity.isPending} />
  );
}
