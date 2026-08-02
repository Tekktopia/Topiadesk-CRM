'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../../_components/confirm-dialog';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import { carrierTypeLabel } from '../../../_lib/constants';
import { fullName } from '../../../_lib/format';
import { useCarrier, useContacts, useDeleteCarrier, useDeleteContact } from '../../../_lib/hooks';
import type { Contact } from '../../../_lib/types';
import { ContactFormDialog } from '../../../accounts/_components/contact-form-dialog';
import { CarrierFormDialog } from '../../_components/carrier-form-dialog';

export function CarrierDetailView({ carrierId }: { carrierId: string }) {
  const router = useRouter();
  const { data: carrier, isLoading } = useCarrier(carrierId);
  const { data: contacts, isLoading: contactsLoading } = useContacts({ carrierId });
  const deleteCarrier = useDeleteCarrier();
  const deleteContact = useDeleteContact();

  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [contactCreateOpen, setContactCreateOpen] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = React.useState<Contact | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!carrier) {
    return <EmptyState title="Carrier not found" description="It may have been deleted." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {carrier.name}
            <Badge variant="outline">{carrierTypeLabel(carrier.carrierType)}</Badge>
          </span>
        }
        description={carrier.linesOfBusiness.length > 0 ? carrier.linesOfBusiness.join(', ') : 'No lines of business on file'}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Carrier actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete carrier
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="A.M. Best rating" value={carrier.amBestRating ?? '—'} />
          <Field label="Panel status" value={carrier.panelStatus ?? '—'} />
          <Field label="Treaty type" value={carrier.treatyType ?? '—'} />
          <Field label="Commission terms" value={carrier.commissionTerms ?? '—'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Contacts</CardTitle>
          <Button size="sm" onClick={() => setContactCreateOpen(true)}>
            <Plus aria-hidden /> Add contact
          </Button>
        </CardHeader>
        <CardContent>
          {contactsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !contacts || contacts.length === 0 ? (
            <EmptyState title="No contacts yet" description="Add the underwriters/brokers your team works with at this carrier." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium text-foreground">{fullName(contact.firstName, contact.lastName)}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.title ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.phone ?? '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Contact actions">
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditingContact(contact)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeletingContact(contact)}
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

      <CarrierFormDialog open={editOpen} onOpenChange={setEditOpen} carrier={carrier} />
      <ContactFormDialog open={contactCreateOpen} onOpenChange={setContactCreateOpen} carrierId={carrierId} />
      {editingContact ? (
        <ContactFormDialog
          open={Boolean(editingContact)}
          onOpenChange={(open) => !open && setEditingContact(null)}
          carrierId={carrierId}
          contact={editingContact}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deletingContact)}
        onOpenChange={(open) => !open && setDeletingContact(null)}
        title={`Remove ${deletingContact ? fullName(deletingContact.firstName, deletingContact.lastName) : ''}?`}
        confirmLabel="Remove contact"
        destructive
        isPending={deleteContact.isPending}
        onConfirm={() => {
          if (!deletingContact) return;
          deleteContact.mutate(deletingContact.id, { onSuccess: () => setDeletingContact(null) });
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${carrier.name}"?`}
        description="This permanently removes the carrier. This cannot be undone."
        confirmLabel="Delete carrier"
        destructive
        isPending={deleteCarrier.isPending}
        onConfirm={() =>
          deleteCarrier.mutate(carrier.id, {
            onSuccess: () => router.push('/carriers'),
          })
        }
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
