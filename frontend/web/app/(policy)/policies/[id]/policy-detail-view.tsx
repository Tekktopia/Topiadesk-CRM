'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, CardContent, RecordHistory, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@topiadesk/ui';
import { formatDate, formatNaira, policyStatusVariant } from '@/app/(policy)/lib/format';
import type { LookupOption, PolicyDto } from '@/app/(policy)/lib/types';
import { LifecycleActions } from './lifecycle-actions';
import { VersionHistory } from './version-history';
import { PremiumsPanel } from './premiums-panel';
import { RenewalPanel } from './renewal-panel';
import { DocumentsPanel } from './documents-panel';
import { SignaturesPanel } from './signatures-panel';
import { ProducersPanel } from './producers-panel';
import { CoveragesPanel } from './coverages-panel';
import { ParticipantsPanel } from './participants-panel';
import { AssetsPanel } from './assets-panel';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Policy detail: the full lifecycle view — key facts, the status-transition
 * / new-version actions (respecting the backend's state machine), version
 * history with the maker-checker approval "decide" affordance, premiums,
 * renewal schedule, and linked documents. Each section is its own Client
 * Component tab, fetching independently via TanStack Query against this
 * feature's app/api/policies/:id/* proxies.
 */
export function PolicyDetailView({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();

  const policyQuery = useQuery({
    queryKey: ['policy', policyId],
    queryFn: () => fetchJson<PolicyDto>(`/api/policies/${policyId}`),
  });
  const lookupsQuery = useQuery({
    queryKey: ['policy-lookups'],
    queryFn: () => fetchJson<{ accounts: LookupOption[]; carriers: LookupOption[] }>('/api/policy-lookups'),
    staleTime: 5 * 60_000,
  });

  const invalidatePolicy = () => {
    void queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
    void queryClient.invalidateQueries({ queryKey: ['policy-versions', policyId] });
  };

  if (policyQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (policyQuery.isError || !policyQuery.data) {
    return (
      <div className="space-y-4">
        <Link href="/policies" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to policies
        </Link>
        <p className="text-sm text-destructive">Couldn&apos;t load this policy — it may not exist or you may not have access.</p>
      </div>
    );
  }

  const policy = policyQuery.data;
  const accountName = lookupsQuery.data?.accounts.find((a) => a.id === policy.accountId)?.name ?? policy.accountId;
  const carrierName = lookupsQuery.data?.carriers.find((c) => c.id === policy.carrierId)?.name ?? policy.carrierId;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/policies" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to policies
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{policy.policyNumber}</h1>
              <Badge variant={policyStatusVariant(policy.status)}>{policy.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {accountName} · {policy.lineOfBusiness} · underwritten by {carrierName}
            </p>
          </div>
          <LifecycleActions policy={policy} onChanged={invalidatePolicy} />
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 py-6 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="Sum insured" value={formatNaira(policy.sumInsured, policy.currency)} />
          <Fact label="Currency" value={policy.currency} />
          <Fact label="Inception" value={formatDate(policy.inceptionDate)} />
          <Fact label="Expiry" value={formatDate(policy.expiryDate)} />
          <Fact label="Last updated" value={formatDate(policy.updatedAt)} />
        </CardContent>
      </Card>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions &amp; approvals</TabsTrigger>
          <TabsTrigger value="coverages">Coverages</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="premiums">Premiums</TabsTrigger>
          <TabsTrigger value="producers">Producers</TabsTrigger>
          <TabsTrigger value="renewal">Renewal</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="signatures">Signatures</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="versions" className="pt-4">
          <VersionHistory policyId={policyId} onChanged={invalidatePolicy} />
        </TabsContent>
        <TabsContent value="coverages" className="pt-4">
          <CoveragesPanel policyId={policyId} />
        </TabsContent>
        <TabsContent value="participants" className="pt-4">
          <ParticipantsPanel policyId={policyId} accountId={policy.accountId} />
        </TabsContent>
        <TabsContent value="assets" className="pt-4">
          <AssetsPanel policyId={policyId} />
        </TabsContent>
        <TabsContent value="premiums" className="pt-4">
          <PremiumsPanel policyId={policyId} />
        </TabsContent>
        <TabsContent value="producers" className="pt-4">
          <ProducersPanel policyId={policyId} />
        </TabsContent>
        <TabsContent value="renewal" className="pt-4">
          <RenewalPanel policyId={policyId} />
        </TabsContent>
        <TabsContent value="documents" className="pt-4">
          <DocumentsPanel policyId={policyId} />
        </TabsContent>
        <TabsContent value="signatures" className="pt-4">
          <SignaturesPanel policyId={policyId} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <RecordHistory entityType="policies" entityId={policyId} fetchUrl={`/api/policies/${policyId}/history`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
