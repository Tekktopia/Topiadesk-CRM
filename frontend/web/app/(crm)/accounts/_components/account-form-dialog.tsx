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
  FormDescription,
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
import { ACCOUNT_STATUSES, ACCOUNT_TYPES, KYC_STATUSES, RISK_RATINGS, accountStatusLabel, accountTypeLabel, kycStatusLabel, riskRatingLabel } from '../../_lib/constants';
import { useCreateAccount, useCustomFieldDefinitions, useUpdateAccount } from '../../_lib/hooks';
import type { Account } from '../../_lib/types';

const accountFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  accountType: z.enum(ACCOUNT_TYPES),
  status: z.enum(ACCOUNT_STATUSES),
  riskRating: z.union([z.enum(RISK_RATINGS), z.literal('')]),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  source: z.string(),
  industryId: z.string(),
  notes: z.string(),
  kycStatus: z.enum(KYC_STATUSES),
  kycExpiryDate: z.string(),
  naicomId: z.string(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

function defaultsFor(account?: Account): AccountFormValues {
  return {
    name: account?.name ?? '',
    accountType: account?.accountType ?? 'CORPORATE',
    status: account?.status ?? 'PROSPECT',
    riskRating: account?.riskRating ?? '',
    city: account?.city ?? '',
    state: '',
    country: account?.country ?? '',
    source: '',
    industryId: account?.industryId ?? '',
    notes: '',
    kycStatus: account?.kycStatus ?? 'NOT_STARTED',
    kycExpiryDate: account?.kycExpiryDate ? account.kycExpiryDate.slice(0, 10) : '',
    naicomId: account?.naicomId ?? '',
  };
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account;
}) {
  const isEdit = Boolean(account);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    values: defaultsFor(account),
  });

  const { data: customFieldDefinitions } = useCustomFieldDefinitions('ACCOUNT');
  const [customFields, setCustomFields] = React.useState<CustomFieldValues>(account?.customFields ?? {});
  React.useEffect(() => {
    setCustomFields(account?.customFields ?? {});
  }, [account]);

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount(account?.id ?? '');
  const isPending = createAccount.isPending || updateAccount.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const customFieldError = validateCustomFieldValues(customFieldDefinitions, customFields, !isEdit);
    if (customFieldError) {
      toast.error(customFieldError);
      return;
    }
    const hasActiveCustomFields = (customFieldDefinitions ?? []).some((d) => d.isActive);
    const payload = {
      name: values.name,
      accountType: values.accountType,
      status: values.status,
      riskRating: values.riskRating || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      country: values.country || undefined,
      source: values.source || undefined,
      industryId: values.industryId || undefined,
      notes: values.notes || undefined,
      kycStatus: values.kycStatus,
      kycExpiryDate: values.kycExpiryDate || undefined,
      naicomId: values.naicomId || undefined,
      customFields: hasActiveCustomFields ? customFields : undefined,
    };
    if (isEdit && account) {
      await updateAccount.mutateAsync(payload);
    } else {
      await createAccount.mutateAsync(payload);
    }
    onOpenChange(false);
    form.reset(defaultsFor(undefined));
    setCustomFields({});
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit account' : 'New account'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this account’s profile.' : 'Create a new client or prospect account.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Delta Oilfield Services Ltd" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {accountTypeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ACCOUNT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {accountStatusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="riskRating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Risk rating</FormLabel>
                  <Select value={field.value || '__unset'} onValueChange={(v) => field.onChange(v === '__unset' ? '' : v)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__unset">Unrated</SelectItem>
                      {RISK_RATINGS.map((rating) => (
                        <SelectItem key={rating} value={rating}>
                          {riskRatingLabel(rating)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="kycStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>KYC status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {KYC_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {kycStatusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="kycExpiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>KYC expiry</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="naicomId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NAICOM ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Port Harcourt" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. NG" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Referral" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="industryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional — UUID" {...field} />
                  </FormControl>
                  <FormDescription>
                    No industry directory endpoint is exposed by the API yet — paste an Industry UUID if you have
                    one, or leave blank.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <CustomFieldsSection entityType="ACCOUNT" values={customFields} onChange={setCustomFields} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
