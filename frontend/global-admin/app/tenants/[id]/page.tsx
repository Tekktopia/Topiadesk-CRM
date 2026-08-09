'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toast,
} from '@topiadesk/ui';
import { apiFetch, ApiError } from '../../_lib/api';
import type { Plan, TenantDetail } from '../../_lib/types';
import { TenantStatusBadge } from '../_status-badge';
import { AdminsTab } from './_admins-tab';
import { UsageTab } from './_usage-tab';
import { GenerateLicenseDialog } from './_generate-license-dialog';

/** Days until `currentPeriodEnd`, or null if there's no expiry set yet
 * (a subscription that's never had a license "generated" against it —
 * see UpdateTenantSubscriptionDto's durationMonths field). */
function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const STEP_ICON: Record<string, React.ReactNode> = {
  IN_PROGRESS: <Loader2 className="h-4 w-4 animate-spin text-warning" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-success" />,
  FAILED: <XCircle className="h-4 w-4 text-destructive" />,
  PENDING: <Clock className="h-4 w-4 text-muted-foreground" />,
};

const STEP_LABEL: Record<string, string> = {
  CREATE_SCHEMA: 'Create Postgres schema',
  APPLY_MIGRATIONS: 'Apply database migrations',
  APPLY_RLS: 'Apply row-level security',
  SEED_BASELINE: 'Seed baseline org structure',
  CREATE_KEYCLOAK_REALM: 'Create Keycloak realm',
  CREATE_ADMIN_USER: 'Create admin user (Keycloak)',
  CREATE_ADMIN_DB_USER: 'Create admin user (database)',
  MARK_ACTIVE: 'Activate tenant',
  SEND_INVITE_EMAIL: 'Send invite email',
};

export default function TenantDetailPage() {
  return (
    <React.Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <TenantDetailPageContent />
    </React.Suspense>
  );
}

function TenantDetailPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenants', params.id],
    queryFn: () => apiFetch<TenantDetail>(`/api/tenants/${params.id}`),
    refetchInterval: (query) => (query.state.data?.status === 'PROVISIONING' ? 3000 : false),
  });

  const { data: plans } = useQuery({ queryKey: ['plans'], queryFn: () => apiFetch<Plan[]>('/api/plans') });

  const suspend = useMutation({
    mutationFn: () => apiFetch(`/api/tenants/${params.id}/suspend`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Tenant suspended');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (err) => toast.error('Could not suspend tenant', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const reactivate = useMutation({
    mutationFn: () => apiFetch(`/api/tenants/${params.id}/reactivate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Tenant reactivated');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (err) => toast.error('Could not reactivate tenant', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const updatePlan = useMutation({
    mutationFn: (planId: string) => apiFetch(`/api/tenants/${params.id}/subscription`, { method: 'PATCH', body: JSON.stringify({ planId }) }),
    onSuccess: () => {
      toast.success('Plan updated');
      queryClient.invalidateQueries({ queryKey: ['tenants', params.id] });
    },
    onError: (err) => toast.error('Could not update plan', { description: err instanceof ApiError ? err.message : undefined }),
  });

  if (isLoading || !tenant) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
            <TenantStatusBadge status={tenant.status} />
          </div>
          <p className="font-mono text-xs text-muted-foreground">{tenant.schemaName}</p>
        </div>
        <div className="flex gap-2">
          {tenant.status === 'ACTIVE' ? (
            <Button variant="destructive" onClick={() => suspend.mutate()} disabled={suspend.isPending}>
              Suspend
            </Button>
          ) : tenant.status === 'SUSPENDED' ? (
            <Button onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>
              Reactivate
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue={searchParams.get('tab') === 'admins' || searchParams.get('tab') === 'usage' ? searchParams.get('tab')! : 'overview'}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="admins">Admins</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Profile</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Primary contact" value={tenant.primaryContactEmail} />
                <Row label="Slug" value={tenant.slug} />
                <Row label="Keycloak realm" value={tenant.keycloakRealm} />
                <Row label="Created" value={new Date(tenant.createdAt).toLocaleString()} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Subscription</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {tenant.subscription ? (
                  <>
                    <Row label="Status" value={<Badge variant="outline">{tenant.subscription.status}</Badge>} />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Plan</span>
                      <Select value={tenant.subscription.planId} onValueChange={(planId) => updatePlan.mutate(planId)} disabled={updatePlan.isPending}>
                        <SelectTrigger className="h-8 w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {plans?.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} ({plan.seatLimit} seats)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Row
                      label="License expires"
                      value={
                        tenant.subscription.currentPeriodEnd ? (
                          (() => {
                            const days = daysUntil(tenant.subscription.currentPeriodEnd);
                            return (
                              <span className={days < 0 ? 'text-destructive' : days <= 14 ? 'text-warning' : undefined}>
                                {new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString()} {days < 0 ? '(expired)' : `(${days}d)`}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )
                      }
                    />
                    <div className="pt-1">
                      <GenerateLicenseDialog tenantId={tenant.id} currentPlanId={tenant.subscription.planId} />
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">No subscription.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Provisioning timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {tenant.provisioningEvents.map((event) => (
                  <li key={event.id} className="flex items-start gap-3">
                    {STEP_ICON[event.status] ?? STEP_ICON.PENDING}
                    <div className="flex-1">
                      <p className={cn('text-sm font-medium', event.status === 'FAILED' && 'text-destructive')}>{STEP_LABEL[event.step] ?? event.step}</p>
                      {event.detail ? <p className="text-xs text-muted-foreground">{event.detail}</p> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleTimeString()}</span>
                  </li>
                ))}
                {tenant.provisioningEvents.length === 0 ? <p className="text-sm text-muted-foreground">No provisioning events yet.</p> : null}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admins">
          <AdminsTab tenantId={tenant.id} />
        </TabsContent>

        <TabsContent value="usage">
          <UsageTab tenantId={tenant.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
