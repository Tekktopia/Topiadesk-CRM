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
import { CASE_PRIORITIES, CASE_TYPES, casePriorityLabel, caseTypeLabel } from '../../_lib/constants';
import { evaluateBusinessRules, validateBusinessRuleValues } from '../../_lib/evaluate-business-rules';
import { useActiveBusinessRules, useCaseCategories, useCreateCase, useDirectoryUsers, usePolicyLookups, useUpdateCase } from '../../_lib/hooks';
import type { Case } from '../../_lib/types';

const UNSET = '__unset';

const caseFormSchema = z.object({
  caseType: z.enum(CASE_TYPES),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string(),
  priority: z.enum(CASE_PRIORITIES),
  categoryId: z.string(),
  accountId: z.string(),
  policyId: z.string(),
  assignedToId: z.string(),
});

type CaseFormValues = z.infer<typeof caseFormSchema>;

const DEFAULTS: CaseFormValues = {
  caseType: 'ENQUIRY',
  subject: '',
  description: '',
  priority: 'MEDIUM',
  categoryId: '',
  accountId: '',
  policyId: '',
  assignedToId: '',
};

function defaultsFor(kase?: Case): CaseFormValues {
  if (!kase) return DEFAULTS;
  return {
    caseType: kase.caseType,
    subject: kase.subject,
    description: kase.description ?? '',
    priority: kase.priority,
    categoryId: kase.categoryId ?? '',
    accountId: kase.accountId ?? '',
    policyId: kase.policyId ?? '',
    assignedToId: kase.assignedToId ?? '',
  };
}

/**
 * "New case" / "Edit case" dialog — passing `kase` switches this to edit
 * mode (mirrors app/(crm)/accounts/_components/account-form-dialog.tsx's
 * create-vs-edit pattern: `values: defaultsFor(kase)` keeps the form synced
 * if a different record is opened, `useUpdateCase(kase.id)` is only called
 * with an id once `kase` exists). caseNumber is server-generated (see
 * CreateCaseDto/cases.controller.ts's generateCaseNumber) and caseType is
 * immutable post-creation (UpdateCaseDto excludes it — see case.dto.ts's own
 * comment), so its Select is disabled in edit mode. categoryId/accountId/
 * policyId/assignedToId are all optional selects sourced from live lookups;
 * leaving assignedToId blank leaves a new case unassigned in the Queue tab.
 */
export function CaseFormDialog({
  open,
  onOpenChange,
  kase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kase?: Case;
}) {
  const isEdit = Boolean(kase);
  const form = useForm<CaseFormValues>({ resolver: zodResolver(caseFormSchema), values: defaultsFor(kase) });
  const createCase = useCreateCase();
  const updateCase = useUpdateCase(kase?.id ?? '');
  const isPending = createCase.isPending || updateCase.isPending;
  const { data: categories } = useCaseCategories();
  const { accounts, policies } = usePolicyLookups();
  const { users } = useDirectoryUsers();

  // Business rules — live require/hide/readonly/set-value preview, mirrored
  // server-side (authoritative) by business-rules.validator.ts. Re-evaluated
  // only when a rule's *condition* field changes (not on every keystroke
  // across the whole form) — see evaluate-business-rules.ts's doc comment.
  const { data: rules } = useActiveBusinessRules('CASE');
  const conditionFields = React.useMemo(() => Array.from(new Set((rules ?? []).map((r) => r.conditionField))), [rules]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watchedConditionValues = form.watch(conditionFields as any);
  const evaluated = React.useMemo(
    () => evaluateBusinessRules(rules ?? [], form.getValues()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, JSON.stringify(watchedConditionValues)],
  );

  // Applies SET_VALUE effects once per settled evaluation, not once per
  // watch tick — a passes counter is the circuit breaker for a pathological
  // rule cycle (rule A sets X when Y matches, rule B sets Y when X matches):
  // without it, two such rules would call setValue forever and eventually
  // hit React's "Maximum update depth exceeded". Every normal (non-cyclic)
  // cascade settles in one or two passes.
  const cyclePasses = React.useRef(0);
  React.useEffect(() => {
    let applied = false;
    for (const [field, value] of Object.entries(evaluated.setValues)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (form.getValues(field as any) !== value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form.setValue(field as any, value, { shouldDirty: true, shouldValidate: true });
        applied = true;
      }
    }
    cyclePasses.current = applied ? cyclePasses.current + 1 : 0;
    if (cyclePasses.current > 5) {
      console.error('Business rule SET_VALUE did not converge — check for a rule cycle (a rule setting a field that is another rule\'s condition, and vice versa)');
      cyclePasses.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluated]);

  const onSubmit = form.handleSubmit(async (values) => {
    const ruleError = validateBusinessRuleValues(evaluated.required, form.getValues());
    if (ruleError) {
      toast.error(ruleError);
      return;
    }
    if (isEdit && kase) {
      await updateCase.mutateAsync({
        categoryId: values.categoryId || undefined,
        subject: values.subject,
        description: values.description || undefined,
        priority: values.priority,
        accountId: values.accountId || undefined,
        policyId: values.policyId || undefined,
        assignedToId: values.assignedToId || undefined,
      });
    } else {
      await createCase.mutateAsync({
        caseType: values.caseType,
        subject: values.subject,
        description: values.description || undefined,
        priority: values.priority,
        categoryId: values.categoryId || undefined,
        accountId: values.accountId || undefined,
        policyId: values.policyId || undefined,
        assignedToId: values.assignedToId || undefined,
      });
    }
    onOpenChange(false);
    form.reset(DEFAULTS);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit ticket' : 'New ticket'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Update ticket ${kase?.caseNumber}.` : 'Log an enquiry, service request, or complaint. Starts in NEW status.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {!evaluated.hidden.has('caseType') && (
                <FormField
                  control={form.control}
                  name="caseType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Type
                        {evaluated.required.has('caseType') ? <span className="text-destructive"> *</span> : null}
                      </FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={isEdit || evaluated.readonly.has('caseType')}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CASE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {caseTypeLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isEdit ? <FormDescription>Type can’t be changed after creation.</FormDescription> : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {!evaluated.hidden.has('priority') && (
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Priority
                        {evaluated.required.has('priority') ? <span className="text-destructive"> *</span> : null}
                      </FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={evaluated.readonly.has('priority')}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CASE_PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {casePriorityLabel(p)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {!evaluated.hidden.has('subject') && (
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Subject
                      {evaluated.required.has('subject') ? <span className="text-destructive"> *</span> : null}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Policy document request" {...field} disabled={evaluated.readonly.has('subject')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!evaluated.hidden.has('description') && (
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description
                      {evaluated.required.has('description') ? <span className="text-destructive"> *</span> : null}
                    </FormLabel>
                    <FormControl>
                      <textarea
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        {...field}
                        disabled={evaluated.readonly.has('description')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!evaluated.hidden.has('categoryId') && (
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Category
                      {evaluated.required.has('categoryId') ? <span className="text-destructive"> *</span> : null}
                    </FormLabel>
                    <Select value={field.value || UNSET} onValueChange={(v) => field.onChange(v === UNSET ? '' : v)} disabled={evaluated.readonly.has('categoryId')}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UNSET}>Uncategorized</SelectItem>
                        {(categories ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              {!evaluated.hidden.has('accountId') && (
                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Account
                        {evaluated.required.has('accountId') ? <span className="text-destructive"> *</span> : null}
                      </FormLabel>
                      <Select value={field.value || UNSET} onValueChange={(v) => field.onChange(v === UNSET ? '' : v)} disabled={evaluated.readonly.has('accountId')}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={UNSET}>None</SelectItem>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {!evaluated.hidden.has('policyId') && (
                <FormField
                  control={form.control}
                  name="policyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Policy
                        {evaluated.required.has('policyId') ? <span className="text-destructive"> *</span> : null}
                      </FormLabel>
                      <Select value={field.value || UNSET} onValueChange={(v) => field.onChange(v === UNSET ? '' : v)} disabled={evaluated.readonly.has('policyId')}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={UNSET}>None</SelectItem>
                          {policies.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {!evaluated.hidden.has('assignedToId') && (
              <FormField
                control={form.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Assign to
                      {evaluated.required.has('assignedToId') ? <span className="text-destructive"> *</span> : null}
                    </FormLabel>
                    <Select value={field.value || UNSET} onValueChange={(v) => field.onChange(v === UNSET ? '' : v)} disabled={evaluated.readonly.has('assignedToId')}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UNSET}>Leave in the Queue</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {users.length === 0 ? <FormDescription>No directory available — leave unassigned to route via the Queue tab.</FormDescription> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create ticket'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
