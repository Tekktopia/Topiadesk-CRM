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
import { CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_OPTION_TYPES, CUSTOM_FIELD_TYPES, humanize } from '../../_lib/constants';
import { useCreateCustomFieldDefinition, useUpdateCustomFieldDefinition } from '../../_lib/hooks';
import type { CustomFieldDefinition, CustomFieldEntityType } from '../../_lib/types';

const customFieldFormSchema = z.object({
  entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  key: z
    .string()
    .min(1, 'Key is required')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Must start with a letter and contain only letters, digits, underscores'),
  label: z.string().min(1, 'Label is required'),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  options: z.string(),
  isRequired: z.boolean(),
  isActive: z.boolean(),
  displayOrder: z.coerce.number().int(),
  helpText: z.string(),
});

type CustomFieldFormValues = z.infer<typeof customFieldFormSchema>;

function defaultsFor(definition?: CustomFieldDefinition, defaultEntityType?: CustomFieldEntityType): CustomFieldFormValues {
  return {
    entityType: definition?.entityType ?? defaultEntityType ?? 'ACCOUNT',
    key: definition?.key ?? '',
    label: definition?.label ?? '',
    fieldType: definition?.fieldType ?? 'TEXT',
    options: (definition?.options ?? []).join(', '),
    isRequired: definition?.isRequired ?? false,
    isActive: definition?.isActive ?? true,
    displayOrder: definition?.displayOrder ?? 0,
    helpText: definition?.helpText ?? '',
  };
}

export function CustomFieldFormDialog({
  open,
  onOpenChange,
  definition,
  defaultEntityType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition?: CustomFieldDefinition;
  /** Pre-selects entityType when creating from an already-filtered list. */
  defaultEntityType?: CustomFieldEntityType;
}) {
  const isEdit = Boolean(definition);
  const form = useForm<CustomFieldFormValues>({
    resolver: zodResolver(customFieldFormSchema),
    values: defaultsFor(definition, defaultEntityType),
  });

  const createDefinition = useCreateCustomFieldDefinition();
  const updateDefinition = useUpdateCustomFieldDefinition(definition?.id ?? '');
  const isPending = createDefinition.isPending || updateDefinition.isPending;

  const fieldType = form.watch('fieldType');
  const showOptions = CUSTOM_FIELD_OPTION_TYPES.has(fieldType);

  const onSubmit = form.handleSubmit(async (values) => {
    const options = showOptions
      ? values.options
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : undefined;

    if (isEdit && definition) {
      await updateDefinition.mutateAsync({
        label: values.label,
        fieldType: values.fieldType,
        options,
        isRequired: values.isRequired,
        isActive: values.isActive,
        displayOrder: values.displayOrder,
        helpText: values.helpText || undefined,
      });
    } else {
      await createDefinition.mutateAsync({
        entityType: values.entityType,
        key: values.key,
        label: values.label,
        fieldType: values.fieldType,
        options,
        isRequired: values.isRequired,
        isActive: values.isActive,
        displayOrder: values.displayOrder,
        helpText: values.helpText || undefined,
      });
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit custom field' : 'New custom field'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Label, type, options, and status can change — entity and key are fixed once values exist under them.'
              : 'Adds an input to the create/edit form for this entity type.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="entityType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entity</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CUSTOM_FIELD_ENTITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {humanize(t)}
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
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. renewalRiskTier" {...field} disabled={isEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Renewal risk tier" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fieldType"
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
                      {CUSTOM_FIELD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {humanize(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showOptions ? (
              <FormField
                control={form.control}
                name="options"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Options</FormLabel>
                    <FormControl>
                      <Input placeholder="Comma-separated, e.g. Low, Medium, High" {...field} />
                    </FormControl>
                    <FormDescription>The choices shown in the dropdown, separated by commas.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="helpText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Help text</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional hint shown below the input" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display order</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>Lower numbers render first among this entity&apos;s custom fields.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <FormField
                control={form.control}
                name="isRequired"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                      Required when creating a new record
                    </label>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                      Active (shown on forms)
                    </label>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create field'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
