'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Fingerprint, ScrollText, ShieldAlert, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, StatTile } from '@topiadesk/ui';
import { PageHeader } from '../_components/page-header';
import { apiFetch } from '../_lib/api';
import type { ComplianceSummaryDto } from '../_lib/types';

/**
 * Hrefs here are real URLs, NOT filesystem paths. `app/(crm)/…` is a Next.js
 * route GROUP — the parenthesised segment exists only to share a layout and
 * never appears in the URL — so the Data Subject Requests page lives at
 * `/data-subject-requests`, not `/crm/data-subject-requests`. The latter was
 * shipped here and 404'd. `/admin/…` below looks similar but is correct for
 * the opposite reason: `(admin)` is the group and `admin` is a genuine path
 * segment underneath it.
 */
const QUICK_LINKS = [
  {
    href: '/data-subject-requests',
    title: 'Data Subject Requests',
    description: 'NDPR/GDPR export & erasure requests — review, fulfill, or reject.',
    icon: Users,
  },
  {
    href: '/admin/audit-log',
    title: 'Audit Log',
    description: 'Hash-chained, tamper-evident record of every compliance-relevant change.',
    icon: ScrollText,
  },
  {
    href: '/admin/roles',
    title: 'Field Permissions',
    description: 'Which roles can see or edit sensitive fields (NAICOM ID, national ID, commissions).',
    icon: ShieldCheck,
  },
];

export default function ComplianceDashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ['compliance', 'summary'],
    queryFn: () => apiFetch<ComplianceSummaryDto>('/api/crm/compliance/summary'),
  });

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="One home for regulatory oversight — data subject rights, KYC, consent, and the audit trail, brought together instead of scattered across CRM and Admin."
      />

      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Open data requests"
            value={summary.openDsrCount}
            icon={<Users className="h-4 w-4" aria-hidden />}
            description="Pending export/erasure requests"
          />
          <StatTile
            label="KYC needs attention"
            value={summary.kycAttentionCount}
            icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
            description="Not started, pending, expired, or rejected"
          />
          <StatTile
            label="KYC expiring soon"
            value={summary.kycExpiringCount}
            icon={<UserCheck className="h-4 w-4" aria-hidden />}
            description="Verified, expiring within 30 days"
          />
          <StatTile
            label="Consent activity"
            value={summary.consentRecordsThisWeek}
            icon={<Fingerprint className="h-4 w-4" aria-hidden />}
            description="Records logged in the last 7 days"
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden />
            Audit chain health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summaryQuery.isLoading ? (
            <Skeleton className="h-5 w-64" />
          ) : summary?.latestCheckpointAt ? (
            <p className="text-sm text-muted-foreground">
              Last checkpoint: <span className="font-medium text-foreground">{new Date(summary.latestCheckpointAt).toLocaleString()}</span> — verified
              automatically every ~5 minutes, with an alert to Admin/Compliance if a hash mismatch is ever found.{' '}
              <Link href="/admin/audit-log" className="text-primary hover:underline">
                View full history
              </Link>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No checkpoints yet — the first one is created within 5 minutes of the worker starting up.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <link.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {link.title}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
