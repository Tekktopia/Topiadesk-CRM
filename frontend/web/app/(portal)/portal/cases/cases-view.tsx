'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LifeBuoy, Plus } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { PortalNav } from '../_components/portal-nav';
import { EmptyState, ErrorState } from '../_components/query-states';
import { formatDateTime } from '../_lib/format';
import { usePortalCases } from '../_lib/queries';
import { NewCaseDialog } from './new-case-dialog';

function statusVariant(status: string): 'default' | 'secondary' | 'success' {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'success';
  if (status === 'NEW') return 'default';
  return 'secondary';
}

export function PortalCasesView() {
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const casesQuery = usePortalCases();
  const cases = casesQuery.data ?? [];

  return (
    <div>
      <PortalNav />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">Support requests</h2>
            <p className="text-sm text-muted-foreground">Raise a request or follow up on an existing one.</p>
          </div>
          <Button onClick={() => setNewCaseOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            New request
          </Button>
        </div>

        {casesQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-none" />
            ))}
          </div>
        ) : casesQuery.isError ? (
          <ErrorState error={casesQuery.error} />
        ) : cases.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy className="h-8 w-8" aria-hidden />}
            title="No requests yet"
            description="Raise a request and our team will get back to you."
            action={
              <Button onClick={() => setNewCaseOpen(true)} size="sm">
                New request
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {cases.map((kase) => (
              <Link key={kase.id} href={`/portal/cases/${kase.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium text-foreground">{kase.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {kase.caseNumber} · {formatDateTime(kase.createdAt)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(kase.status)}>{kase.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <NewCaseDialog open={newCaseOpen} onOpenChange={setNewCaseOpen} />
    </div>
  );
}
