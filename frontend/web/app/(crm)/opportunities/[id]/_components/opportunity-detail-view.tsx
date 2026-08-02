'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  marketSubmissionStatusLabel,
  marketSubmissionStatusVariant,
  taskPriorityLabel,
  taskPriorityVariant,
  taskStatusLabel,
  taskStatusVariant,
} from '../../../_lib/constants';
import { formatCurrency, formatDate } from '../../../_lib/format';
import {
  useAccount,
  useActivities,
  useAllPipelineStages,
  useCarriers,
  useCreateActivity,
  useDeleteOpportunity,
  useDirectoryUsers,
  useMarketSubmissions,
  useOpportunity,
  useTasksForEntity,
  useUpdateOpportunityStage,
} from '../../../_lib/hooks';
import { OpportunityFormDialog } from '../../_components/opportunity-form-dialog';
import { MarketSubmissionFormDialog } from './market-submission-form-dialog';

export function OpportunityDetailView({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const { data: opportunity, isLoading } = useOpportunity(opportunityId);
  const { data: account } = useAccount(opportunity?.accountId);
  const { stagesById } = useAllPipelineStages();
  const updateStage = useUpdateOpportunityStage();
  const deleteOpportunity = useDeleteOpportunity();

  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [submissionOpen, setSubmissionOpen] = React.useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!opportunity) {
    return <EmptyState title="Opportunity not found" description="It may have been deleted." />;
  }

  const currentStage = stagesById.get(opportunity.pipelineStageId);
  const stagesInPipeline = Array.from(stagesById.values())
    .filter((s) => s.pipelineId === currentStage?.pipelineId)
    .sort((a, b) => a.order - b.order);
  const otherStages = stagesInPipeline.filter((s) => s.id !== opportunity.pipelineStageId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {opportunity.name}
            <Badge variant={currentStage?.isWon ? 'success' : currentStage?.isLost ? 'destructive' : 'outline'}>
              {currentStage?.name ?? '—'}
            </Badge>
          </span>
        }
        description={
          account ? (
            <>
              Account:{' '}
              <Link href={`/accounts/${account.id}`} className="hover:underline">
                {account.name}
              </Link>
            </>
          ) : (
            'Loading account…'
          )
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={updateStage.isPending}>
                  {updateStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight aria-hidden />}
                  Move stage
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {otherStages.map((stage) => (
                  <DropdownMenuItem
                    key={stage.id}
                    onSelect={() => updateStage.mutate({ id: opportunity.id, input: { pipelineStageId: stage.id } })}
                  >
                    {stage.name}
                    {stage.isWon ? <Badge variant="success" className="ml-auto">Won</Badge> : null}
                    {stage.isLost ? <Badge variant="destructive" className="ml-auto">Lost</Badge> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Opportunity actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete opportunity
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
          <Field label="Amount" value={formatCurrency(opportunity.amount)} />
          <Field label="Probability" value={`${opportunity.probability}%`} />
          <Field label="Line of business" value={opportunity.lineOfBusiness ?? '—'} />
          <Field label="Expected close" value={formatDate(opportunity.expectedCloseDate)} />
          <Field label="Actual close" value={formatDate(opportunity.actualCloseDate)} />
          <Field label="Pipeline" value={currentStage?.pipelineName ?? '—'} />
          {opportunity.wonReason ? <Field label="Won reason" value={opportunity.wonReason} /> : null}
          {opportunity.lostReason ? <Field label="Lost reason" value={opportunity.lostReason} /> : null}
        </CardContent>
      </Card>

      <MarketSubmissionsCard opportunityId={opportunityId} onLogSubmission={() => setSubmissionOpen(true)} />
      <RelatedTasksCard opportunityId={opportunityId} />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityLog opportunityId={opportunityId} />
        </CardContent>
      </Card>

      <OpportunityFormDialog open={editOpen} onOpenChange={setEditOpen} opportunity={opportunity} />
      <MarketSubmissionFormDialog open={submissionOpen} onOpenChange={setSubmissionOpen} opportunityId={opportunityId} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${opportunity.name}"?`}
        description="This permanently removes the opportunity. This cannot be undone."
        confirmLabel="Delete opportunity"
        destructive
        isPending={deleteOpportunity.isPending}
        onConfirm={() =>
          deleteOpportunity.mutate(opportunity.id, {
            onSuccess: () => router.push('/opportunities'),
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

function MarketSubmissionsCard({ opportunityId, onLogSubmission }: { opportunityId: string; onLogSubmission: () => void }) {
  const { data, isLoading } = useMarketSubmissions(opportunityId);
  const { data: carriers } = useCarriers();
  const carriersById = new Map((carriers ?? []).map((c) => [c.id, c]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Market submissions</CardTitle>
        <Button size="sm" onClick={onLogSubmission}>
          <Plus aria-hidden /> Log submission
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState title="Not shopped to any carriers yet" description="Log which carriers this has been submitted to." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carrier</TableHead>
                <TableHead>Quoted premium</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Responded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium text-foreground">
                    {carriersById.get(submission.carrierId)?.name ?? submission.carrierId}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatCurrency(submission.quotedPremium)}</TableCell>
                  <TableCell>
                    <Badge variant={marketSubmissionStatusVariant(submission.status)}>
                      {marketSubmissionStatusLabel(submission.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(submission.submittedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(submission.respondedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RelatedTasksCard({ opportunityId }: { opportunityId: string }) {
  const { data, isLoading } = useTasksForEntity({ opportunityId });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <EmptyState title="No tasks yet" description="Tasks linked to this opportunity will show up here." />
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

function ActivityLog({ opportunityId }: { opportunityId: string }) {
  const { data, isLoading } = useActivities({ opportunityId });
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
      opportunityId,
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
