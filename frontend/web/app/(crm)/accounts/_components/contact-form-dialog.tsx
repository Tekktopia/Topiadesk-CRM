'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@topiadesk/ui';
import { useCreateContact, useUpdateContact } from '../../_lib/hooks';
import type { Contact } from '../../_lib/types';

const contactFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.union([z.string().email('Enter a valid email'), z.literal('')]),
  phone: z.string(),
  title: z.string(),
  isPrimary: z.boolean(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

function defaultsFor(contact?: Contact): ContactFormValues {
  return {
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    title: contact?.title ?? '',
    isPrimary: contact?.isPrimary ?? false,
  };
}

export function ContactFormDialog({
  open,
  onOpenChange,
  accountId,
  carrierId,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exactly one of accountId/carrierId must be set — mirrors the backend's contacts_exactly_one_parent constraint. */
  accountId?: string;
  carrierId?: string;
  contact?: Contact;
}) {
  const isEdit = Boolean(contact);
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    values: defaultsFor(contact),
  });

  const createContact = useCreateContact();
  const updateContact = useUpdateContact(accountId);
  const isPending = createContact.isPending || updateContact.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email || undefined,
      phone: values.phone || undefined,
      title: values.title || undefined,
      isPrimary: values.isPrimary,
    };
    if (isEdit && contact) {
      await updateContact.mutateAsync({ id: contact.id, input: payload });
    } else {
      await createContact.mutateAsync({ accountId, carrierId, ...payload });
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add contact'}</DialogTitle>
          <DialogDescription>A person at this account your team works with.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Risk Manager" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isPrimary"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    Primary contact for this account
                  </label>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Add contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
