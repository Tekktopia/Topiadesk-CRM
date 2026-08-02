'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { carrierTypeLabel } from '../../_lib/constants';
import { useCarriers, useDeleteCarrier } from '../../_lib/hooks';
import type { Carrier } from '../../_lib/types';
import { CarrierFormDialog } from './carrier-form-dialog';

export function CarriersListView() {
  const { data, isLoading } = useCarriers();
  const deleteCarrier = useDeleteCarrier();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Carrier | null>(null);
  const [deleting, setDeleting] = React.useState<Carrier | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carriers"
        description="Insurers and reinsurers on your placement panel."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New carrier
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data || data.length === 0 ? (
            <EmptyState
              title="No carriers yet"
              description="Add insurers and reinsurers to shop opportunities to them."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New carrier
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>A.M. Best</TableHead>
                  <TableHead>Lines of business</TableHead>
                  <TableHead>Panel status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((carrier) => (
                  <TableRow key={carrier.id}>
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/carriers/${carrier.id}`} className="hover:underline">
                        {carrier.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{carrierTypeLabel(carrier.carrierType)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{carrier.amBestRating ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {carrier.linesOfBusiness.length > 0 ? carrier.linesOfBusiness.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{carrier.panelStatus ?? '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Carrier actions">
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(carrier)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleting(carrier)}
                          >
                            <Trash2 aria-hidden /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CarrierFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <CarrierFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} carrier={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the carrier. This cannot be undone."
        confirmLabel="Delete carrier"
        destructive
        isPending={deleteCarrier.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteCarrier.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
