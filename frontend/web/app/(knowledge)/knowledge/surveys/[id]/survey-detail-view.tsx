'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Percent, TrendingUp, Users } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, StatTile, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@topiadesk/ui';
import { EmptyState, ErrorState } from '../../../_components/query-states';
import { SURVEY_TRIGGER_EVENT_LABEL, SURVEY_TYPE_LABEL } from '../../../_lib/constants';
import { formatDateTime } from '../../../_lib/format';
import { useSurvey, useSurveyResponses } from '../../../_lib/queries';
import { ScoreDistributionChart } from './score-distribution-chart';

/** Response list + score distribution for a single survey — the "detail
 * view per survey" half of /knowledge/surveys. GET .../responses requires
 * survey_response:read (ALL-scope-only, same COMPLIANCE_OFFICER/ADMIN tier
 * as the survey definition itself per seed.ts). */
export function SurveyDetailView({ surveyId }: { surveyId: string }) {
  const surveyQuery = useSurvey(surveyId);
  const responsesQuery = useSurveyResponses(surveyId);

  const responded = useMemo(() => (responsesQuery.data ?? []).filter((r) => r.respondedAt !== null && r.score !== null), [responsesQuery.data]);
  const sent = responsesQuery.data?.length ?? 0;
  const responseRate = sent > 0 ? Math.round((responded.length / sent) * 100) : 0;
  const averageScore = responded.length > 0 ? responded.reduce((sum, r) => sum + (r.score ?? 0), 0) / responded.length : null;

  if (surveyQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (surveyQuery.isError || !surveyQuery.data) {
    return (
      <div className="space-y-4">
        <Link href="/knowledge/surveys" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to surveys
        </Link>
        <ErrorState error={surveyQuery.error ?? new Error('Survey not found')} />
      </div>
    );
  }

  const survey = surveyQuery.data;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/knowledge/surveys" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to surveys
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{survey.name}</h1>
          <Badge variant={survey.isActive ? 'success' : 'secondary'}>{survey.isActive ? 'Active' : 'Inactive'}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {SURVEY_TYPE_LABEL[survey.type]} · triggered on {SURVEY_TRIGGER_EVENT_LABEL[survey.triggerEvent]} · scale {survey.scaleMin}–{survey.scaleMax}
        </p>
        <p className="max-w-2xl text-sm text-foreground">&ldquo;{survey.questionText}&rdquo;</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Sent" value={sent} icon={<Users className="h-4 w-4" />} />
        <StatTile label="Response rate" value={`${responseRate}%`} icon={<Percent className="h-4 w-4" />} description={`${responded.length} responded`} />
        <StatTile
          label="Average score"
          value={averageScore !== null ? averageScore.toFixed(1) : '—'}
          icon={<TrendingUp className="h-4 w-4" />}
          description={`of ${survey.scaleMin}–${survey.scaleMax}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {responsesQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : responsesQuery.isError ? (
            <ErrorState error={responsesQuery.error} />
          ) : (
            <ScoreDistributionChart scaleMin={survey.scaleMin} scaleMax={survey.scaleMax} scores={responded.map((r) => r.score as number)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responses</CardTitle>
        </CardHeader>
        <CardContent>
          {responsesQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : responsesQuery.isError ? (
            <ErrorState error={responsesQuery.error} />
          ) : (responsesQuery.data ?? []).length === 0 ? (
            <EmptyState icon={<MessageSquare className="h-8 w-8" aria-hidden />} title="No responses recorded yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Responded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(responsesQuery.data ?? []).map((response) => (
                  <TableRow key={response.id}>
                    <TableCell className="text-muted-foreground">{response.channel}</TableCell>
                    <TableCell className="tabular-nums text-foreground">{response.score ?? '—'}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">{response.comment ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(response.sentAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {response.respondedAt ? formatDateTime(response.respondedAt) : <Badge variant="secondary">Pending</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
