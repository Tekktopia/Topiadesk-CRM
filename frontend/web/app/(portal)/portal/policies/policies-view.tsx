'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Badge, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { PortalNav } from '../_components/portal-nav';
import { EmptyState, ErrorState } from '../_components/query-states';
import { formatDate } from '../_lib/format';
import { usePortalPolicies } from '../_lib/queries';

export function PortalPoliciesView() {
  const policiesQuery = usePortalPolicies();
  const policies = policiesQuery.data ?? [];

  return (
    <div>
      <PortalNav />
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-medium text-foreground">Your policies</h2>
          <p className="text-sm text-muted-foreground">A read-only view of every policy on your account.</p>
        </div>

        {policiesQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-none" />
            ))}
          </div>
        ) : policiesQuery.isError ? (
          <ErrorState error={policiesQuery.error} />
        ) : policies.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" aria-hidden />} title="No policies yet" />
        ) : (
          <div className="space-y-3">
            {policies.map((policy) => (
              <Link key={policy.id} href={`/portal/policies/${policy.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium text-foreground">{policy.policyNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {policy.lineOfBusiness} · expires {formatDate(policy.expiryDate)}
                      </p>
                    </div>
                    <Badge variant={policy.status === 'ACTIVE' ? 'default' : 'secondary'}>{policy.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
