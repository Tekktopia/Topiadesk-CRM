'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Search, Sparkles, TrendingUp } from 'lucide-react';
import {
  ActivityTimeline,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  toast,
  type ActivityTimelineItem,
  type ActivityTimelineSentiment,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { apiFetch, ApiRequestError } from '../../../_lib/api';
import { useActivities, useDirectoryUsers } from '../../../_lib/hooks';

/**
 * AI Insight panel — Account detail's Phase 2 addition (backend/api/src/
 * modules/ai-gateway/). Every call here is a human-triggered, advisory-only
 * request against the fully local AI engine (no external API, no per-request
 * cost) — nothing auto-fetches on mount, nothing writes its result back onto
 * the Account/Activity records. The API exposes no sentiment rollup or
 * dedicated "similar accounts" endpoint (verified by reading
 * ai-gateway.controller.ts): /ai/account-insight is the closest thing to a
 * rollup (a renewal-prep narrative), /ai/sentiment analyzes one piece of text
 * at a time, and /ai/search is a generic semantic search over indexed
 * entities (accounts are indexable, per indexable-entity-types.ts, but
 * nothing seeds an index — an empty result here is normal, not a bug).
 */

const AI_CAPABLE_ROLES = ['ADMIN', 'MANAGER', 'ACCOUNT_HANDLER'];
// Caps how many recent activities get sent through /ai/sentiment per click —
// each one is a separate metered Anthropic call, so this stays small
// deliberately rather than analyzing everything in the timeline at once.
const MAX_SENTIMENT_ANALYSES = 3;

interface AccountInsightResult {
  narrative: string;
  riskFlags: string[];
}

interface SentimentResult {
  label: ActivityTimelineSentiment;
  score: number;
  escalationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  keyPhrases: string[];
}

interface SemanticSearchResult {
  results: Array<{ entityType: string; entityId: string; snippet: string; score: number }>;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Something went wrong — please try again.';
}

export function AiInsightPanel({ accountId, accountName }: { accountId: string; accountName: string }) {
  const { user: currentUser } = useCurrentUser();
  const canUseAi = !!currentUser && currentUser.roles.some((r) => AI_CAPABLE_ROLES.includes(r));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Advisory, AI-generated suggestions, run locally — nothing on this tab is saved to the account automatically.
      </p>
      {!canUseAi ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Your role doesn&apos;t have AI copilot access, so the actions below are disabled. Ask an administrator for
            an <code className="font-mono text-xs">ai_usage:write</code> grant if you need this.
          </CardContent>
        </Card>
      ) : null}
      <AccountInsightCard accountId={accountId} disabled={!canUseAi} />
      <RecentActivitySentimentCard accountId={accountId} disabled={!canUseAi} />
      <SimilarAccountsCard accountId={accountId} accountName={accountName} disabled={!canUseAi} />
    </div>
  );
}

function AccountInsightCard({ accountId, disabled }: { accountId: string; disabled: boolean }) {
  const insightMutation = useMutation({
    mutationFn: () =>
      apiFetch<AccountInsightResult>('/api/ai/account-insight', {
        method: 'POST',
        body: JSON.stringify({ accountId }),
      }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" aria-hidden /> Renewal-prep insight
          </CardTitle>
          <CardDescription>A narrative summary covering policies, premiums, upcoming renewals, and recent activity.</CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || insightMutation.isPending}
          onClick={() => insightMutation.mutate()}
        >
          {insightMutation.isPending ? 'Generating…' : insightMutation.data ? 'Regenerate' : 'Generate insight'}
        </Button>
      </CardHeader>
      {insightMutation.isPending ? (
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      ) : insightMutation.data ? (
        <CardContent className="space-y-3">
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{insightMutation.data.narrative}</p>
          {insightMutation.data.riskFlags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {insightMutation.data.riskFlags.map((flag, i) => (
                <Badge key={i} variant="warning">
                  {flag}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function RecentActivitySentimentCard({ accountId, disabled }: { accountId: string; disabled: boolean }) {
  const activitiesQuery = useActivities({ accountId });
  const { usersById } = useDirectoryUsers();
  const [sentimentById, setSentimentById] = React.useState<Record<string, SentimentResult>>({});

  const candidates = React.useMemo(
    () => (activitiesQuery.data ?? []).filter((a) => (a.body ?? '').trim().length > 0).slice(0, MAX_SENTIMENT_ANALYSES),
    [activitiesQuery.data],
  );

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const results: Record<string, SentimentResult> = {};
      // Sequential, not Promise.all — this is metered per-call against a
      // per-user daily cap, so this deliberately doesn't fan out N
      // simultaneous requests for what's already a small, capped batch.
      for (const activity of candidates) {
        const result = await apiFetch<SentimentResult>('/api/ai/sentiment', {
          method: 'POST',
          body: JSON.stringify({ entityId: activity.id, entityType: 'activity', text: activity.body ?? activity.subject }),
        });
        results[activity.id] = result;
        setSentimentById((prev) => ({ ...prev, [activity.id]: result }));
      }
      return results;
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items: ActivityTimelineItem[] = candidates.map((a) => ({
    id: a.id,
    type: a.type,
    direction: a.direction,
    subject: a.subject,
    body: a.body,
    occurredAt: a.occurredAt,
    durationMinutes: a.durationMinutes,
    outcome: a.outcome,
    authorName: a.createdById ? (usersById.get(a.createdById)?.fullName ?? null) : null,
    aiSentiment: sentimentById[a.id]?.label ?? null,
    aiSentimentScore: sentimentById[a.id]?.score ?? null,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" aria-hidden /> Recent activity sentiment
          </CardTitle>
          <CardDescription>
            Analyzes the {MAX_SENTIMENT_ANALYSES} most recent activities that have note/message text.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || analyzeMutation.isPending || candidates.length === 0}
          onClick={() => analyzeMutation.mutate()}
        >
          {analyzeMutation.isPending ? 'Analyzing…' : 'Analyze sentiment'}
        </Button>
      </CardHeader>
      <CardContent>
        {activitiesQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activities with note or message text to analyze yet.</p>
        ) : (
          <ActivityTimeline items={items} />
        )}
      </CardContent>
    </Card>
  );
}

function SimilarAccountsCard({ accountId, accountName, disabled }: { accountId: string; accountName: string; disabled: boolean }) {
  const searchMutation = useMutation({
    mutationFn: () =>
      apiFetch<SemanticSearchResult>('/api/ai/search', {
        method: 'POST',
        body: JSON.stringify({ query: accountName, entityTypes: ['account'], limit: 6 }),
      }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const otherAccountResults = (searchMutation.data?.results ?? []).filter(
    (r) => r.entityType === 'account' && r.entityId !== accountId,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" aria-hidden /> Similar accounts
          </CardTitle>
          <CardDescription>
            Semantic search over indexed accounts, using this account&apos;s name as the query. Depends on what has
            been indexed via the AI Gateway — an empty result is expected if nothing has.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={disabled || searchMutation.isPending} onClick={() => searchMutation.mutate()}>
          {searchMutation.isPending ? 'Searching…' : 'Find similar accounts'}
        </Button>
      </CardHeader>
      {searchMutation.isPending ? (
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      ) : searchMutation.data ? (
        <CardContent>
          {otherAccountResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No similar accounts found in the semantic index.</p>
          ) : (
            <ul className="space-y-2">
              {otherAccountResults.map((r) => (
                <li key={r.entityId} className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/accounts/${r.entityId}`} className="font-medium text-foreground hover:underline">
                      {r.snippet.length > 80 ? `${r.snippet.slice(0, 80)}…` : r.snippet || r.entityId}
                    </Link>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {Math.round(r.score * 100)}% match
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
