'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@topiadesk/ui';
import { formatDate, formatNaira, producerCommissionStatusVariant, producerStatusVariant, producerTypeLabel } from '@/app/(policy)/lib/format';
import type { ProducerCommissionDto, ProducerDto, UserOption } from '@/app/(policy)/lib/types';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { ProducerFormDialog } from '../_components/producer-form-dialog';
import { ProducerHierarchyPanel } from './producer-hierarchy-panel';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function ProducerDetailView({ producerId }: { producerId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const producerQuery = useQuery({
    queryKey: ['producer', producerId],
    queryFn: () => fetchJson<ProducerDto>(`/api/producers/${producerId}`),
  });
  const producersQuery = useQuery({ queryKey: ['producers'], queryFn: () => fetchJson<ProducerDto[]>('/api/producers') });
  const usersQuery = useQuery({
    queryKey: ['identity-users'],
    queryFn: () => fetchJson<UserOption[]>('/api/identity-users'),
    staleTime: 5 * 60_000,
  });
  const commissionsQuery = useQuery({
    queryKey: ['producer-commissions', { producerId }],
    queryFn: () => fetchJson<ProducerCommissionDto[]>(`/api/producer-commissions?producerId=${producerId}`),
  });

  const deleteProducer = useMutation({
    mutationFn: () => fetch(`/api/producers/${producerId}`, { method: 'DELETE', credentials: 'same-origin' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      router.push('/producers');
    },
  });

  if (producerQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (producerQuery.isError || !producerQuery.data) {
    return (
      <div className="space-y-4">
        <Link href="/producers" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to producers
        </Link>
        <p className="text-sm text-destructive">Couldn&apos;t load this producer — it may not exist or you may not have access.</p>
      </div>
    );
  }

  const producer = producerQuery.data;
  const producers = producersQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const parentName = producer.parentProducerId ? (producers.find((p) => p.id === producer.parentProducerId)?.name ?? '—') : '—';
  const linkedUser = producer.linkedUserId ? users.find((u) => u.id === producer.linkedUserId) : undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/producers" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to producers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{producer.name}</h1>
              <Badge variant="outline">{producerTypeLabel(producer.type)}</Badge>
              <Badge variant={producerStatusVariant(producer.status)}>{producer.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {producer.producerCode} · reports to {parentName}
              {linkedUser ? ` · linked to ${linkedUser.fullName}` : ' · no TopiaDesk login'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Producer actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete producer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="License number" value={producer.licenseNumber ?? '—'} />
              <Field label="License expiry" value={producer.licenseExpiry ? formatDate(producer.licenseExpiry) : '—'} />
              <Field label="Phone" value={producer.phone ?? '—'} />
              <Field label="Email" value={producer.email ?? '—'} />
              <Field label="Reports to" value={parentName} />
              <Field label="Linked user" value={linkedUser ? `${linkedUser.fullName} (${linkedUser.email})` : 'No TopiaDesk login'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hierarchy" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sub-producers</CardTitle>
            </CardHeader>
            <CardContent>
              {producersQuery.isLoading ? <Skeleton className="h-24 w-full" /> : <ProducerHierarchyPanel producerId={producerId} producers={producers} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Commissions</CardTitle>
            </CardHeader>
            <CardContent>
              {commissionsQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !commissionsQuery.data || commissionsQuery.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">No commission records yet for this producer.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commission #</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Net payable</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionsQuery.data.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-foreground">{c.commissionNumber}</TableCell>
                        <TableCell className="text-muted-foreground">{c.period}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNaira(c.netPayable)}</TableCell>
                        <TableCell>
                          <Badge variant={producerCommissionStatusVariant(c.status)}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.paymentDate ? formatDate(c.paymentDate) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProducerFormDialog open={editOpen} onOpenChange={setEditOpen} producer={producer} producers={producers} users={users} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${producer.name}"?`}
        description="This permanently removes the producer. Any sub-producers reporting to them and any commission-split assignments referencing them should be reassigned first."
        confirmLabel="Delete producer"
        destructive
        isPending={deleteProducer.isPending}
        onConfirm={() => deleteProducer.mutate()}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}
