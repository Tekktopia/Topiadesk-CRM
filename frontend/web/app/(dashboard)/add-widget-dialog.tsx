'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { DimensionSelect, NO_DIMENSION } from '../(reports)/_components/dimension-select';
import { DynamicFilterForm } from '../(reports)/_components/dynamic-filter-form';
import { buildFiltersPayload, deriveFilterFields } from '../(reports)/_lib/filter-schema';
import { useReportCatalog } from '../(reports)/_lib/hooks';
import type { DashboardWidgetSpec } from './types';

/**
 * Widget picker for the customizable home dashboard — pick a report from
 * the same registry-driven catalog the Reports module itself uses
 * (`GET /reports`, already has `allowedDimensions`/measures per entry, no
 * extra endpoint needed), optionally group it, optionally filter it, and
 * add it as a tile. Reuses DynamicFilterForm/DimensionSelect verbatim
 * (same "closed, schema-derived inputs only" contract the Reports module
 * itself relies on) rather than re-inventing a filter UI here.
 */
export function AddWidgetDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; onAdd: (widget: DashboardWidgetSpec) => void }) {
  const { data: catalog } = useReportCatalog();
  const [reportKey, setReportKey] = useState('');
  const [title, setTitle] = useState('');
  const [dimension, setDimension] = useState(NO_DIMENSION);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const entry = useMemo(() => catalog?.find((r) => r.key === reportKey), [catalog, reportKey]);
  const fields = useMemo(() => deriveFilterFields(entry?.filterSchema), [entry]);

  useEffect(() => {
    if (!open) {
      setReportKey('');
      setTitle('');
      setDimension(NO_DIMENSION);
      setFilterValues({});
    }
  }, [open]);

  useEffect(() => {
    if (entry) setTitle(entry.name);
    setDimension(NO_DIMENSION);
    setFilterValues({});
  }, [entry]);

  function handleAdd() {
    if (!entry) return;
    const filters = buildFiltersPayload(fields, filterValues);
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim() || entry.name,
      reportKey: entry.key,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      dimension: dimension === NO_DIMENSION ? undefined : dimension,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add widget</DialogTitle>
          <DialogDescription>Pick a report to add to your dashboard.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Report</Label>
            <Select value={reportKey} onValueChange={setReportKey}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a report" />
              </SelectTrigger>
              <SelectContent>
                {(catalog ?? []).map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {entry ? <p className="text-xs text-muted-foreground">{entry.description}</p> : null}
          </div>

          {entry ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="widget-title">Widget title</Label>
                <Input id="widget-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              {entry.allowedDimensions.length > 0 ? (
                <DimensionSelect dimensions={entry.allowedDimensions} value={dimension} onChange={setDimension} />
              ) : null}

              <DynamicFilterForm fields={fields} values={filterValues} onChange={(key, value) => setFilterValues((prev) => ({ ...prev, [key]: value }))} idPrefix="widget-filter-" />
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!entry} onClick={handleAdd}>
            Add widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
