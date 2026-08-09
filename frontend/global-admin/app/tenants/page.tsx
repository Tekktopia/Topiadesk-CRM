'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { Tenant } from '../_lib/types';
import { CreateTenantDialog } from './_create-tenant-dialog';
import { TenantStatusBadge } from './_status-badge';
import { PageHeader } from '../_components/page-header';

export default function TenantsPage() {
  return (
    <React.Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <TenantsPageContent />
    </React.Suspense>
  );
}

function TenantsPageContent() {
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = React.useState(searchParams.get('new') === '1');

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiFetch<Tenant[]>('/api/tenants'),
    refetchInterval: 5000, // provisioning is async — poll while any tenant is mid-flight
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Tenants"
        description="Every customer organization on the TopiaDesk platform."
        actions={<CreateTenantDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
      />

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Primary contact</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : tenants && tenants.length > 0 ? (
              tenants.map((tenant) => (
                <TableRow key={tenant.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/tenants/${tenant.id}`} className="hover:underline">
                      {tenant.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{tenant.slug}</TableCell>
                  <TableCell>
                    <TenantStatusBadge status={tenant.status} />
                  </TableCell>
                  <TableCell>{tenant.primaryContactEmail}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No tenants yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
