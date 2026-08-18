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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { AccountCombobox, type AccountRef } from '../../_components/account-combobox';
import { IndustryCombobox } from '../../_components/industry-combobox';
import { TagInput } from '../../_components/tag-input';
import { CustomFieldsSection, validateCustomFieldValues, type CustomFieldValues } from '../../_components/custom-fields-section';
import { ACCOUNT_STATUSES, ACCOUNT_TYPES, KYC_STATUSES, RISK_RATINGS, accountStatusLabel, accountTypeLabel, kycStatusLabel, riskRatingLabel } from '../../_lib/constants';
import { useCreateAccount, useCustomFieldDefinitions, useIndustry, useUpdateAccount } from '../../_lib/hooks';
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
    state: account?.state ?? '',
    country: account?.country ?? '',
    source: account?.source ?? '',
    notes: account?.notes ?? '',
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
  const [tags, setTags] = React.useState<string[]>(account?.tags ?? []);
  const [parentAccount, setParentAccount] = React.useState<AccountRef | null>(null);
  const { data: currentIndustry } = useIndustry(account?.industryId ?? undefined);
  const [industry, setIndustry] = React.useState<{ id: string; name: string } | null>(null);

  React.useEffect(() => {
    setCustomFields(account?.customFields ?? {});
    setTags(account?.tags ?? []);
    // parentAccountId's name isn't on the plain Account response (only
    // AccountDetail carries a resolved `parentAccount` ref) — this dialog
    // is opened from both the list (Account) and detail (AccountDetail)
    // pages, so cleared here and re-derived below whenever we do have it.
    setParentAccount(null);
  }, [account]);

  React.useEffect(() => {
    const withParent = account as (Account & { parentAccount?: AccountRef | null }) | undefined;
    if (withParent?.parentAccount) setParentAccount(withParent.parentAccount);
  }, [account]);

  React.useEffect(() => {
    setIndustry(currentIndustry ? { id: currentIndustry.id, name: currentIndustry.name } : null);
  }, [currentIndustry]);

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
      industryId: industry?.id,
      parentAccountId: parentAccount?.id,
      notes: values.notes || undefined,
      kycStatus: values.kycStatus,
      kycExpiryDate: values.kycExpiryDate || undefined,
      naicomId: values.naicomId || undefined,
      tags,
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
    setTags([]);
    setParentAccount(null);
    setIndustry(null);
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

            <div className="space-y-1.5">
              <Label>Parent account</Label>
              <AccountCombobox
                value={parentAccount}
                onChange={setParentAccount}
                placeholder="None — search to link a parent…"
                excludeId={account?.id}
              />
              <p className="text-sm text-muted-foreground">Rolls this account into a parent&apos;s hierarchy (group premium rollup, org chart).</p>
            </div>

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
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Rivers" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <div className="space-y-1.5">
              <Label>Industry</Label>
              <IndustryCombobox value={industry} onChange={setIndustry} />
            </div>

            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagInput value={tags} onChange={setTags} />
            </div>

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
