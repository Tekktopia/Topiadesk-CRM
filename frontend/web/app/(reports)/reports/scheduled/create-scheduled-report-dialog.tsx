'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { DimensionSelect, NO_DIMENSION } from '../../_components/dimension-select';
import { DynamicFilterForm } from '../../_components/dynamic-filter-form';
import { buildFiltersPayload, deriveFilterFields } from '../../_lib/filter-schema';
import { useCreateScheduledReport, useIdentityUsers, useReportCatalog } from '../../_lib/hooks';
import type { ScheduledReportDeliveryChannel, ScheduledReportFormat, ScheduledReportFrequency } from '../../_lib/types';

const DAY_OF_WEEK_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

interface RecipientRow {
  channel: ScheduledReportDeliveryChannel;
  userId: string;
  webhookUrl: string;
}

function emptyRecipient(): RecipientRow {
  return { channel: 'EMAIL', userId: '', webhookUrl: '' };
}

/**
 * "New scheduled report" — reuses the exact same schema-driven
 * DynamicFilterForm/DimensionSelect the report runner uses (`filters`/
 * `dimension` are validated against the same target report's filterSchema/
 * allowedDimensions server-side either way, see scheduled-reports.
 * controller.ts's `validateFilters`/`validateDimension`), plus the
 * cadence + recipient fields CreateScheduledReportDto adds on top.
 */
export function CreateScheduledReportDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [reportKey, setReportKey] = React.useState('');
  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({});
  const [dimension, setDimension] = React.useState(NO_DIMENSION);
  const [format, setFormat] = React.useState<ScheduledReportFormat>('PDF');
  const [frequency, setFrequency] = React.useState<ScheduledReportFrequency>('WEEKLY');
  const [dayOfWeek, setDayOfWeek] = React.useState('1');
  const [dayOfMonth, setDayOfMonth] = React.useState('1');
  const [hourOfDayUtc, setHourOfDayUtc] = React.useState('6');
  const [recipients, setRecipients] = React.useState<RecipientRow[]>([emptyRecipient()]);

  const catalogQuery = useReportCatalog();
  const usersQuery = useIdentityUsers();
  const definition = catalogQuery.data?.find((r) => r.key === reportKey);
  const fields = React.useMemo(() => deriveFilterFields(definition?.filterSchema), [definition]);
  const createMutation = useCreateScheduledReport();

  function reset() {
    setName('');
    setReportKey('');
    setFilterValues({});
    setDimension(NO_DIMENSION);
    setFormat('PDF');
    setFrequency('WEEKLY');
    setDayOfWeek('1');
    setDayOfMonth('1');
    setHourOfDayUtc('6');
    setRecipients([emptyRecipient()]);
  }

  function updateRecipient(index: number, patch: Partial<RecipientRow>) {
    setRecipients((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');
    if (!reportKey) return toast.error('Choose a report');
    for (const r of recipients) {
      if (r.channel === 'WEBHOOK' && !r.webhookUrl.trim()) return toast.error('Every webhook recipient needs a URL');
      if (r.channel !== 'WEBHOOK' && !r.userId) return toast.error('Every email/in-app recipient needs a user');
    }

    createMutation.mutate(
      {
        name: name.trim(),
        reportKey,
        filters: buildFiltersPayload(fields, filterValues),
        dimension: dimension === NO_DIMENSION ? undefined : dimension,
        format,
        frequency,
        dayOfWeek: frequency === 'WEEKLY' ? Number(dayOfWeek) : undefined,
        dayOfMonth: frequency === 'MONTHLY' || frequency === 'QUARTERLY' ? Number(dayOfMonth) : undefined,
        hourOfDayUtc: Number(hourOfDayUtc),
        recipients: recipients.map((r) => ({
          channel: r.channel,
          userId: r.channel !== 'WEBHOOK' ? r.userId : undefined,
          webhookUrl: r.channel === 'WEBHOOK' ? r.webhookUrl.trim() : undefined,
        })),
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden /> New scheduled report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New scheduled report</DialogTitle>
            <DialogDescription>Pick a report, its filters, a cadence, and who receives each generated delivery.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="sr-name">Name</Label>
              <Input id="sr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly premium aging — Corporate Broking" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sr-report">Report</Label>
              <Select
                value={reportKey}
                onValueChange={(next) => {
                  setReportKey(next);
                  setFilterValues({});
                  setDimension(NO_DIMENSION);
                }}
              >
                <SelectTrigger id="sr-report">
                  <SelectValue placeholder={catalogQuery.isLoading ? 'Loading…' : 'Choose a report'} />
                </SelectTrigger>
                <SelectContent>
                  {(catalogQuery.data ?? []).map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {definition ? (
              <div className="space-y-4 rounded-md border border-border p-3">
                <DynamicFilterForm
                  fields={fields}
                  values={filterValues}
                  onChange={(key, value) => setFilterValues((prev) => ({ ...prev, [key]: value }))}
                  idPrefix="sr-filter-"
                />
                <DimensionSelect dimensions={definition.allowedDimensions} value={dimension} onChange={setDimension} id="sr-dimension" />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sr-format">Format</Label>
                <Select value={format} onValueChange={(next) => setFormat(next as ScheduledReportFormat)}>
                  <SelectTrigger id="sr-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PDF">PDF</SelectItem>
                    <SelectItem value="EXCEL">Excel</SelectItem>
                    <SelectItem value="CSV">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sr-frequency">Frequency</Label>
                <Select value={frequency} onValueChange={(next) => setFrequency(next as ScheduledReportFrequency)}>
                  <SelectTrigger id="sr-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {frequency === 'WEEKLY' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="sr-day-of-week">Day of week</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                    <SelectTrigger id="sr-day-of-week">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OF_WEEK_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : frequency === 'MONTHLY' || frequency === 'QUARTERLY' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="sr-day-of-month">Day of month</Label>
                  <Input id="sr-day-of-month" type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
                </div>
              ) : (
                <div />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="sr-hour">Hour of day (UTC)</Label>
                <Input id="sr-hour" type="number" min={0} max={23} value={hourOfDayUtc} onChange={(e) => setHourOfDayUtc(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Recipients</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setRecipients((prev) => [...prev, emptyRecipient()])}>
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add recipient
                </Button>
              </div>
              {recipients.map((recipient, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Select value={recipient.channel} onValueChange={(next) => updateRecipient(index, { channel: next as ScheduledReportDeliveryChannel })}>
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMAIL">Email</SelectItem>
                      <SelectItem value="IN_APP">In-app</SelectItem>
                      <SelectItem value="WEBHOOK">Webhook</SelectItem>
                    </SelectContent>
                  </Select>

                  {recipient.channel === 'WEBHOOK' ? (
                    <Input
                      placeholder="https://…"
                      value={recipient.webhookUrl}
                      onChange={(e) => updateRecipient(index, { webhookUrl: e.target.value })}
                    />
                  ) : (
                    <Select value={recipient.userId} onValueChange={(next) => updateRecipient(index, { userId: next })}>
                      <SelectTrigger>
                        <SelectValue placeholder={usersQuery.isLoading ? 'Loading…' : 'Choose a user'} />
                      </SelectTrigger>
                      <SelectContent>
                        {(usersQuery.data ?? []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.fullName} ({u.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={recipients.length <= 1}
                    onClick={() => setRecipients((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove recipient"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create scheduled report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
