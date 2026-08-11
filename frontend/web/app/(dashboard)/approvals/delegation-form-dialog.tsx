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
import { useCreateApprovalDelegation, useDelegationColleagues } from '../dashboard-hooks';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function inTwoWeeksIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

const delegationFormSchema = z
  .object({
    delegateId: z.string().min(1, 'Pick who to delegate to'),
    startDate: z.string().min(1, 'Required'),
    endDate: z.string().min(1, 'Required'),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

type DelegationFormValues = z.infer<typeof delegationFormSchema>;

export function DelegationFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: colleagues, isLoading: colleaguesLoading } = useDelegationColleagues();
  const createDelegation = useCreateApprovalDelegation();

  const form = useForm<DelegationFormValues>({
    resolver: zodResolver(delegationFormSchema),
    defaultValues: { delegateId: '', startDate: todayIso(), endDate: inTwoWeeksIso(), note: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await createDelegation.mutateAsync({
      delegateId: values.delegateId,
      startsAt: new Date(`${values.startDate}T00:00:00`).toISOString(),
      endsAt: new Date(`${values.endDate}T23:59:59`).toISOString(),
      note: values.note || undefined,
    });
    form.reset({ delegateId: '', startDate: todayIso(), endDate: inTwoWeeksIso(), note: '' });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delegate my approvals</DialogTitle>
          <DialogDescription>
            Applies only to workflow approval gates you&apos;re named on — case closures, policy endorsements, and other approval
            types are already decided by whoever holds that authority org-wide, so there&apos;s nothing to hand off there.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="delegateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delegate to</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={colleaguesLoading ? 'Loading…' : 'Choose a colleague'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(colleagues ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Until</FormLabel>
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
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Out on leave" {...field} />
                  </FormControl>
                  <FormDescription>Shown to your delegate so they know why a gate they didn&apos;t request now shows up as theirs.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createDelegation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createDelegation.isPending}>
                {createDelegation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Create delegation
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
