'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { PortalNav } from '../../_components/portal-nav';
import { ErrorState } from '../../_components/query-states';
import { formatDate, formatMoney } from '../../_lib/format';
import { usePortalPolicy } from '../../_lib/queries';

export function PortalPolicyDetailView({ policyId }: { policyId: string }) {
  const policyQuery = usePortalPolicy(policyId);

  return (
    <div>
      <PortalNav />
      <div className="space-y-4">
        <Link href="/portal/policies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to policies
        </Link>

        {policyQuery.isLoading ? (
          <Skeleton className="h-48 w-full rounded-none" />
        ) : policyQuery.isError ? (
          <ErrorState error={policyQuery.error} />
        ) : policyQuery.data ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{policyQuery.data.policyNumber}</h2>
                  <p className="text-sm text-muted-foreground">{policyQuery.data.lineOfBusiness}</p>
                </div>
                <Badge variant={policyQuery.data.status === 'ACTIVE' ? 'default' : 'secondary'}>{policyQuery.data.status}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Sum insured</dt>
                  <dd className="font-medium tabular-nums text-foreground">{formatMoney(policyQuery.data.sumInsured, policyQuery.data.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Currency</dt>
                  <dd className="font-medium text-foreground">{policyQuery.data.currency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Inception date</dt>
                  <dd className="font-medium text-foreground">{formatDate(policyQuery.data.inceptionDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Expiry date</dt>
                  <dd className="font-medium text-foreground">{formatDate(policyQuery.data.expiryDate)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
