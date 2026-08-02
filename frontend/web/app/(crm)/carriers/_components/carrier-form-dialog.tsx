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
} from '@topiadesk/ui';
import { CARRIER_TYPES, carrierTypeLabel } from '../../_lib/constants';
import { useCreateCarrier, useUpdateCarrier } from '../../_lib/hooks';
import type { Carrier } from '../../_lib/types';

const carrierFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  carrierType: z.enum(CARRIER_TYPES),
  amBestRating: z.string(),
  linesOfBusiness: z.string(),
  panelStatus: z.string(),
  treatyType: z.string(),
  commissionTerms: z.string(),
});

type CarrierFormValues = z.infer<typeof carrierFormSchema>;

function defaultsFor(carrier?: Carrier): CarrierFormValues {
  return {
    name: carrier?.name ?? '',
    carrierType: carrier?.carrierType ?? 'INSURER',
    amBestRating: carrier?.amBestRating ?? '',
    linesOfBusiness: carrier?.linesOfBusiness.join(', ') ?? '',
    panelStatus: carrier?.panelStatus ?? '',
    treatyType: carrier?.treatyType ?? '',
    commissionTerms: carrier?.commissionTerms ?? '',
  };
}

export function CarrierFormDialog({
  open,
  onOpenChange,
  carrier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrier?: Carrier;
}) {
  const isEdit = Boolean(carrier);
  const form = useForm<CarrierFormValues>({
    resolver: zodResolver(carrierFormSchema),
    values: defaultsFor(carrier),
  });

  const createCarrier = useCreateCarrier();
  const updateCarrier = useUpdateCarrier(carrier?.id ?? '');
  const isPending = createCarrier.isPending || updateCarrier.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      carrierType: values.carrierType,
      amBestRating: values.amBestRating || undefined,
      linesOfBusiness: values.linesOfBusiness
        ? values.linesOfBusiness.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      panelStatus: values.panelStatus || undefined,
      treatyType: values.treatyType || undefined,
      commissionTerms: values.commissionTerms || undefined,
    };
    if (isEdit && carrier) {
      await updateCarrier.mutateAsync(payload);
    } else {
      await createCarrier.mutateAsync(payload);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit carrier' : 'New carrier'}</DialogTitle>
          <DialogDescription>Insurers and reinsurers on your placement panel.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Carrier name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. AIICO Insurance Plc" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="carrierType"
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
                      {CARRIER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {carrierTypeLabel(type)}
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
                name="amBestRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>A.M. Best rating</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. B++" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="panelStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Panel status</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. ACTIVE" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="linesOfBusiness"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lines of business</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Marine, Property, Engineering" {...field} />
                  </FormControl>
                  <FormDescription>Comma-separated.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch('carrierType') !== 'INSURER' ? (
              <FormField
                control={form.control}
                name="treatyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Treaty type</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Quota Share" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="commissionTerms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commission terms</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
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
                {isEdit ? 'Save changes' : 'Create carrier'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
