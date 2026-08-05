'use client';

import * as React from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@topiadesk/ui';
import { WEEKDAY_KEYS } from '../../_lib/constants';
import { useAddBusinessHoliday, useBusinessHolidays, useCreateBusinessHoursCalendar, useDeleteBusinessHoliday, useUpdateBusinessHoursCalendar } from '../../_lib/hooks';
import type { BusinessHoursCalendar, DayWindow, WeeklyHours } from '../../_lib/types';

const WEEKDAY_LABEL: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DEFAULT_WINDOW: DayWindow = { start: '09:00', end: '17:00' };

/**
 * Create/edit dialog for a business hours calendar. The weekly-hours editor
 * mirrors backend/api's WeeklyHours shape exactly (one optional window per
 * day, see business-hours.util.ts). Holiday management is a nested resource
 * (POST/DELETE /business-hours-calendars/:id/holidays[/:holidayId]) that
 * only exists once the calendar itself does — same "create first, then
 * manage the nested list" constraint sla-policy-form-dialog.tsx works around
 * for SLA targets, except business hours calendars have no inline-create
 * path for holidays at all, so this section is edit-mode only per the build
 * brief ("the calendar CRUD itself is the priority").
 */
export function BusinessHoursCalendarFormDialog({
  open,
  onOpenChange,
  calendar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendar?: BusinessHoursCalendar;
}) {
  const isEdit = Boolean(calendar);
  const [name, setName] = React.useState('');
  const [timezone, setTimezone] = React.useState('');
  const [isDefault, setIsDefault] = React.useState(false);
  const [weeklyHours, setWeeklyHours] = React.useState<WeeklyHours>({});

  React.useEffect(() => {
    if (!open) return;
    if (calendar) {
      setName(calendar.name);
      setTimezone(calendar.timezone);
      setIsDefault(calendar.isDefault);
      setWeeklyHours(calendar.weeklyHours ?? {});
    } else {
      setName('');
      setTimezone('');
      setIsDefault(false);
      setWeeklyHours({ mon: DEFAULT_WINDOW, tue: DEFAULT_WINDOW, wed: DEFAULT_WINDOW, thu: DEFAULT_WINDOW, fri: DEFAULT_WINDOW });
    }
  }, [open, calendar]);

  const createCalendar = useCreateBusinessHoursCalendar();
  const updateCalendar = useUpdateBusinessHoursCalendar(calendar?.id ?? '');
  const isPending = createCalendar.isPending || updateCalendar.isPending;

  function toggleDay(day: (typeof WEEKDAY_KEYS)[number], open2: boolean) {
    setWeeklyHours((prev) => ({ ...prev, [day]: open2 ? (prev[day] ?? DEFAULT_WINDOW) : null }));
  }

  function updateWindow(day: (typeof WEEKDAY_KEYS)[number], patch: Partial<DayWindow>) {
    setWeeklyHours((prev) => ({ ...prev, [day]: { ...(prev[day] ?? DEFAULT_WINDOW), ...patch } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, timezone, weeklyHours, isDefault };
    if (isEdit && calendar) {
      await updateCalendar.mutateAsync(payload);
    } else {
      await createCalendar.mutateAsync(payload);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit business hours calendar' : 'New business hours calendar'}</DialogTitle>
          <DialogDescription>
            Defines the open hours the SLA engine uses to compute due dates — attach it to an SLA policy to pause the clock outside these
            windows and on holidays.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="calendar-name">Name</Label>
              <Input id="calendar-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Lagos business hours" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calendar-timezone">Timezone (IANA)</Label>
              <Input id="calendar-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required placeholder="e.g. Africa/Lagos" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Default calendar
          </label>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Weekly hours</p>
            <div className="space-y-1.5">
              {WEEKDAY_KEYS.map((day) => {
                const window = weeklyHours[day];
                const dayOpen = Boolean(window);
                return (
                  <div key={day} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-secondary/40 p-2">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={dayOpen}
                        onChange={(e) => toggleDay(day, e.target.checked)}
                      />
                      {WEEKDAY_LABEL[day]}
                    </label>
                    <Input
                      type="time"
                      className="h-8 w-28"
                      disabled={!dayOpen}
                      value={window?.start ?? ''}
                      onChange={(e) => updateWindow(day, { start: e.target.value })}
                    />
                    <Input
                      type="time"
                      className="h-8 w-28"
                      disabled={!dayOpen}
                      value={window?.end ?? ''}
                      onChange={(e) => updateWindow(day, { end: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {isEdit && calendar ? <HolidaysSection calendarId={calendar.id} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name || !timezone}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create calendar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HolidaysSection({ calendarId }: { calendarId: string }) {
  const { data: holidays } = useBusinessHolidays(calendarId);
  const addHoliday = useAddBusinessHoliday(calendarId);
  const deleteHoliday = useDeleteBusinessHoliday(calendarId);
  const [date, setDate] = React.useState('');
  const [name, setName] = React.useState('');

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">Holidays</p>
      <div className="space-y-2">
        {(holidays ?? []).map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-md bg-secondary/40 p-2 text-sm">
            <span>
              {h.date} · {h.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => deleteHoliday.mutate(h.id)}
              disabled={deleteHoliday.isPending}
              aria-label="Remove holiday"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input className="h-8" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Year's Day" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!date || !name || addHoliday.isPending}
            onClick={() => {
              addHoliday.mutate(
                { date, name },
                {
                  onSuccess: () => {
                    setDate('');
                    setName('');
                  },
                },
              );
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}
