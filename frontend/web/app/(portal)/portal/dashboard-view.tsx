'use client';

import Link from 'next/link';
import { FileText, LifeBuoy } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';
import { PortalNav } from './_components/portal-nav';
import { usePortalCases, usePortalMe, usePortalPolicies } from './_lib/queries';

export function PortalDashboardView() {
  const meQuery = usePortalMe();
  const policiesQuery = usePortalPolicies();
  const casesQuery = usePortalCases();

  const activePolicyCount = (policiesQuery.data ?? []).filter((p) => p.status === 'ACTIVE').length;
  const openCaseCount = (casesQuery.data ?? []).filter((c) => c.status !== 'RESOLVED' && c.status !== 'CLOSED').length;

  return (
    <div>
      <PortalNav />
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-medium text-foreground">
            Welcome{meQuery.data?.contactName ? `, ${meQuery.data.contactName}` : ''}
          </h2>
          <p className="text-sm text-muted-foreground">Here&apos;s a quick look at your account.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Link href="/portal/policies">
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-3 py-6">
                <FileText className="h-8 w-8 text-primary" aria-hidden />
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{policiesQuery.isLoading ? '—' : activePolicyCount}</p>
                  <p className="text-xs text-muted-foreground">Active policies</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/portal/cases">
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-3 py-6">
                <LifeBuoy className="h-8 w-8 text-primary" aria-hidden />
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{casesQuery.isLoading ? '—' : openCaseCount}</p>
                  <p className="text-xs text-muted-foreground">Open support requests</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
