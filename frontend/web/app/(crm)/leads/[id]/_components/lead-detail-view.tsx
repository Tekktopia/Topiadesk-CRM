'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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

export function LeadDetailView({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { data: lead, isLoading } = useLead(leadId);
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
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Score" value={String(lead.score)} />
          <Field label="Source" value={humanize(lead.source)} />
          <Field label="Campaign" value={lead.sourceCampaign ?? '—'} />
          <Field label="Email" value={lead.email ?? '—'} />
          <Field label="Phone" value={lead.phone ?? '—'} />
          <Field label="Created" value={formatDate(lead.createdAt)} />
          {lead.qualificationNotes ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Qualification notes</p>
              <p className="text-foreground">{lead.qualificationNotes}</p>
            </div>
          ) : null}
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
    authorName: usersById.get(a.createdById)?.fullName ?? null,
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
