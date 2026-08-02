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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { CarrierSelect } from '../../../_components/carrier-select';
import { MARKET_SUBMISSION_STATUSES, marketSubmissionStatusLabel } from '../../../_lib/constants';
import { useCreateMarketSubmission } from '../../../_lib/hooks';

const marketSubmissionSchema = z.object({
  carrierId: z.string().min(1, 'Select a carrier'),
  quotedPremium: z.string(),
  status: z.enum(MARKET_SUBMISSION_STATUSES),
  notes: z.string(),
});

type MarketSubmissionFormValues = z.infer<typeof marketSubmissionSchema>;

export function MarketSubmissionFormDialog({
  open,
  onOpenChange,
  opportunityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
}) {
  const form = useForm<MarketSubmissionFormValues>({
    resolver: zodResolver(marketSubmissionSchema),
    defaultValues: { carrierId: '', quotedPremium: '', status: 'SUBMITTED', notes: '' },
  });
  const createSubmission = useCreateMarketSubmission(opportunityId);

  const onSubmit = form.handleSubmit(async (values) => {
    await createSubmission.mutateAsync({
      carrierId: values.carrierId,
      quotedPremium: values.quotedPremium || undefined,
      status: values.status,
      notes: values.notes || undefined,
    });
    form.reset({ carrierId: '', quotedPremium: '', status: 'SUBMITTED', notes: '' });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log a market submission</DialogTitle>
          <DialogDescription>Track which carrier this opportunity has been shopped to.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="carrierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Carrier</FormLabel>
                  <FormControl>
                    <CarrierSelect value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quotedPremium"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quoted premium</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 4200000.00" {...field} />
                    </FormControl>
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
                        {MARKET_SUBMISSION_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {marketSubmissionStatusLabel(s)}
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createSubmission.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSubmission.isPending}>
                {createSubmission.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Log submission
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
