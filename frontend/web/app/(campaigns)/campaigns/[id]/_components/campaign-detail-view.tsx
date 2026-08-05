'use client';

import * as React from 'react';
import {
  Ban,
  MailOpen,
  MousePointerClick,
  Pause,
  Play,
  Send,
  ShieldAlert,
  Trophy,
  Truck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../../_components/confirm-dialog';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import { abTestMetricLabel, campaignStatusLabel, campaignStatusVariant, channelLabel } from '../../../_lib/constants';
import { formatDateTime, formatPercent } from '../../../_lib/format';
import {
  useAudienceSegments,
  useCampaign,
  useCampaignPerformance,
  useCampaignRecipients,
  useCampaignTemplates,
  useCancelCampaign,
  useDecideAbTestWinner,
  usePauseCampaign,
  useResumeCampaign,
} from '../../../_lib/hooks';
import { CampaignFunnelChart } from './campaign-funnel-chart';
import { RecipientsTable } from './recipients-table';
import { SendScheduleDialog } from './send-schedule-dialog';

type ConfirmAction = 'pause' | 'resume' | 'cancel' | 'decide-winner' | null;

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const templatesQuery = useCampaignTemplates();
  const segmentsQuery = useAudienceSegments();
  const performanceQuery = useCampaignPerformance(campaignId, campaign?.status);
  const recipientsQuery = useCampaignRecipients(campaignId, campaign?.status);

  const pauseCampaign = usePauseCampaign(campaignId);
  const resumeCampaign = useResumeCampaign(campaignId);
  const cancelCampaign = useCancelCampaign(campaignId);
  const decideWinner = useDecideAbTestWinner(campaignId);

  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<ConfirmAction>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return <EmptyState title="Campaign not found" description="It may have been deleted, or you may not have access to it." />;
  }

  const template = templatesQuery.data?.find((t) => t.id === campaign.templateId);
  const segment = segmentsQuery.data?.find((s) => s.id === campaign.segmentId);
  const performance = performanceQuery.data;

  const canSendOrSchedule = campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED';
  const canPause = campaign.status === 'SENDING' || campaign.status === 'SCHEDULED';
  const canResume = campaign.status === 'PAUSED';
  const canCancel = campaign.status !== 'SENT' && campaign.status !== 'CANCELLED';
  const canDecideWinner = campaign.abTestEnabled && !campaign.abTestDecidedAt && campaign.status === 'SENDING';

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {campaign.name}
            <Badge variant={campaignStatusVariant(campaign.status)}>{campaignStatusLabel(campaign.status)}</Badge>
            <Badge variant="outline">{channelLabel(campaign.channel)}</Badge>
            {campaign.abTestEnabled ? <Badge variant="outline">A/B test</Badge> : null}
          </span>
        }
        description={
          campaign.sentAt
            ? `Sent ${formatDateTime(campaign.sentAt)}`
            : campaign.scheduledSendAt
              ? `Scheduled for ${formatDateTime(campaign.scheduledSendAt)}`
              : 'Not yet scheduled'
        }
        actions={
          <>
            {canSendOrSchedule ? (
              <Button onClick={() => setSendDialogOpen(true)}>
                <Send aria-hidden /> Send / schedule
              </Button>
            ) : null}
            {canPause ? (
              <Button variant="outline" onClick={() => setConfirmAction('pause')}>
                <Pause aria-hidden /> Pause
              </Button>
            ) : null}
            {canResume ? (
              <Button variant="outline" onClick={() => setConfirmAction('resume')}>
                <Play aria-hidden /> Resume
              </Button>
            ) : null}
            {canDecideWinner ? (
              <Button variant="outline" onClick={() => setConfirmAction('decide-winner')}>
                <Trophy aria-hidden /> Decide A/B winner
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmAction('cancel')}>
                <Ban aria-hidden /> Cancel
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Delivery rate" value={formatPercent(performance?.deliveryRate)} icon={<Truck />} description="delivered / sent" />
        <StatTile label="Open rate" value={formatPercent(performance?.openRate)} icon={<MailOpen />} description="opened / delivered" />
        <StatTile label="Click rate" value={formatPercent(performance?.clickRate)} icon={<MousePointerClick />} description="clicked / delivered" />
        <StatTile label="Bounce rate" value={formatPercent(performance?.bounceRate)} icon={<ShieldAlert />} description="bounced / sent" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recipients">Recipients{performance ? ` (${performance.totalRecipients})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Template" value={template?.name ?? campaign.templateId ?? '—'} />
              <Field label="Audience segment" value={segment?.name ?? campaign.segmentId ?? '—'} />
              <Field label="Channel" value={channelLabel(campaign.channel)} />
              <Field label="Created" value={formatDateTime(campaign.createdAt)} />
              <Field label="Scheduled for" value={formatDateTime(campaign.scheduledSendAt)} />
              <Field label="Sent at" value={formatDateTime(campaign.sentAt)} />
              {campaign.abTestEnabled ? (
                <>
                  <Field label="A/B metric" value={campaign.abTestMetric ? abTestMetricLabel(campaign.abTestMetric) : '—'} />
                  <Field label="A/B sample" value={campaign.abTestSamplePercent ? `${campaign.abTestSamplePercent}%` : '—'} />
                  <Field label="A/B winner decided" value={formatDateTime(campaign.abTestDecidedAt)} />
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send funnel</CardTitle>
              <CardDescription>Recipients update live while the campaign is scheduled or sending.</CardDescription>
            </CardHeader>
            <CardContent>
              {performanceQuery.isLoading ? <Skeleton className="h-32 w-full" /> : performance ? <CampaignFunnelChart performance={performance} /> : null}
            </CardContent>
          </Card>

          {performance?.byVariant && performance.byVariant.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Variant breakdown</CardTitle>
                <CardDescription>
                  {campaign.abTestWinnerVariantId ? 'A winner has been decided.' : 'A/B test in progress — decide a winner once there’s enough send data.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Clicked</TableHead>
                      <TableHead>Open rate</TableHead>
                      <TableHead>Click rate</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performance.byVariant.map((v) => (
                      <TableRow key={v.variantId}>
                        <TableCell className="font-medium text-foreground">{v.label}</TableCell>
                        <TableCell className="text-muted-foreground">{v.sent}</TableCell>
                        <TableCell className="text-muted-foreground">{v.opened}</TableCell>
                        <TableCell className="text-muted-foreground">{v.clicked}</TableCell>
                        <TableCell className="text-muted-foreground">{formatPercent(v.openRate)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatPercent(v.clickRate)}</TableCell>
                        <TableCell>{campaign.abTestWinnerVariantId === v.variantId ? <Badge variant="success">Winner</Badge> : null}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="recipients">
          <Card>
            <CardHeader>
              <CardTitle>Recipients</CardTitle>
              <CardDescription>Per-recipient delivery status — updates as the provider reports events back.</CardDescription>
            </CardHeader>
            <CardContent>
              <RecipientsTable recipients={recipientsQuery.data} isLoading={recipientsQuery.isLoading} variants={campaign.variants} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SendScheduleDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen} campaign={campaign} />

      <ConfirmDialog
        open={confirmAction === 'pause'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Pause this campaign?"
        description="Recipients already sent won't be recalled. Remaining pending recipients stop draining until you resume."
        confirmLabel="Pause"
        isPending={pauseCampaign.isPending}
        onConfirm={() => pauseCampaign.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
      />
      <ConfirmDialog
        open={confirmAction === 'resume'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Resume this campaign?"
        description="Sending continues to the remaining pending recipients."
        confirmLabel="Resume"
        isPending={resumeCampaign.isPending}
        onConfirm={() => resumeCampaign.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
      />
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Cancel this campaign?"
        description="Any recipients not yet sent won't receive it. This cannot be undone."
        confirmLabel="Cancel campaign"
        destructive
        isPending={cancelCampaign.isPending}
        onConfirm={() => cancelCampaign.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
      />
      <ConfirmDialog
        open={confirmAction === 'decide-winner'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Decide the A/B test winner?"
        description={`Compares variants by ${campaign.abTestMetric ? abTestMetricLabel(campaign.abTestMetric) : 'the configured metric'} and sends the remaining held-back recipients to whichever variant wins. This cannot be undone.`}
        confirmLabel="Decide winner"
        isPending={decideWinner.isPending}
        onConfirm={() => decideWinner.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
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
