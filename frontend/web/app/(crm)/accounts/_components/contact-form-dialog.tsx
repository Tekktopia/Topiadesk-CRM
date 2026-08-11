'use client';

import * as React from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { CustomFieldsSection, validateCustomFieldValues, type CustomFieldValues } from '../../_components/custom-fields-section';
import { useCreateContact, useCustomFieldDefinitions, useSites, useUpdateContact } from '../../_lib/hooks';
import type { Contact } from '../../_lib/types';

const NO_SITE = '__none';

const contactFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.union([z.string().email('Enter a valid email'), z.literal('')]),
  phone: z.string(),
  title: z.string(),
  householdRole: z.string(),
  idType: z.string(),
  idNumber: z.string(),
  isPrimary: z.boolean(),
  siteId: z.string(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

function defaultsFor(contact?: Contact): ContactFormValues {
  return {
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    title: contact?.title ?? '',
    householdRole: contact?.householdRole ?? '',
    idType: contact?.idType ?? '',
    idNumber: contact?.idNumber ?? '',
    isPrimary: contact?.isPrimary ?? false,
    siteId: contact?.siteId ?? NO_SITE,
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

  const { data: customFieldDefinitions } = useCustomFieldDefinitions('CONTACT');
  const { data: sites } = useSites(accountId);
  const [customFields, setCustomFields] = React.useState<CustomFieldValues>(contact?.customFields ?? {});
  React.useEffect(() => {
    setCustomFields(contact?.customFields ?? {});
  }, [contact]);

  const createContact = useCreateContact();
  const updateContact = useUpdateContact(accountId);
  const isPending = createContact.isPending || updateContact.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const customFieldError = validateCustomFieldValues(customFieldDefinitions, customFields, !isEdit);
    if (customFieldError) {
      toast.error(customFieldError);
      return;
    }
    const hasActiveCustomFields = (customFieldDefinitions ?? []).some((d) => d.isActive);
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email || undefined,
      phone: values.phone || undefined,
      title: values.title || undefined,
      householdRole: values.householdRole || undefined,
      idType: values.idType || undefined,
      idNumber: values.idNumber || undefined,
      isPrimary: values.isPrimary,
      siteId: values.siteId === NO_SITE ? undefined : values.siteId,
      customFields: hasActiveCustomFields ? customFields : undefined,
    };
    if (isEdit && contact) {
      await updateContact.mutateAsync({ id: contact.id, input: payload });
    } else {
      await createContact.mutateAsync({ accountId, carrierId, ...payload });
    }
    onOpenChange(false);
    setCustomFields({});
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
              name="householdRole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Household role</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Spouse, Child (household accounts only)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="idType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID type</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. National ID, Passport" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="idNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID number</FormLabel>
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
            {accountId && sites && sites.length > 0 ? (
              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_SITE}>No specific site</SelectItem>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
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

            <CustomFieldsSection entityType="CONTACT" values={customFields} onChange={setCustomFields} />

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
