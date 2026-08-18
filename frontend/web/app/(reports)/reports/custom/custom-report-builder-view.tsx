'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Play, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@topiadesk/ui';
import { csrfHeaders } from '@/lib/csrf';

interface CustomReportField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'enum' | 'boolean';
  filterable: boolean;
  groupable: boolean;
}

interface CustomReportEntity {
  entity: string;
  label: string;
  fields: CustomReportField[];
}

interface FilterRow {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: string;
}

interface CustomReportResult {
  rows: Record<string, unknown>[];
  totalCount: number;
}

const OPERATOR_LABELS: Record<FilterRow['operator'], string> = {
  eq: 'is',
  neq: 'is not',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  contains: 'contains',
  in: 'is one of (comma-separated)',
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Object && 'toISOString' in value) return String(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value)) return new Date(value).toLocaleDateString();
  return String(value);
}

function toCsv(rows: Record<string, unknown>[]): string {
  const [firstRow] = rows;
  if (!firstRow) return '';
  const columns = Object.keys(firstRow);
  const escape = (v: unknown) => `"${formatCell(v).replace(/"/gu, '""')}"`;
  return [columns.join(','), ...rows.map((row) => columns.map((c) => escape(row[c])).join(','))].join('\n');
}

export function CustomReportBuilderView() {
  const [entityKey, setEntityKey] = React.useState<string>('');
  const [selectedFields, setSelectedFields] = React.useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = React.useState<Set<string>>(new Set());
  const [filters, setFilters] = React.useState<FilterRow[]>([]);
  const [result, setResult] = React.useState<CustomReportResult | null>(null);

  const entitiesQuery = useQuery({
    queryKey: ['reports', 'custom', 'entities'],
    queryFn: async (): Promise<CustomReportEntity[]> => {
      const res = await fetch('/api/reports/custom/entities');
      if (!res.ok) throw new Error('Failed to load entities');
      return res.json();
    },
  });

  const entity = entitiesQuery.data?.find((e) => e.entity === entityKey) ?? null;

  React.useEffect(() => {
    setSelectedFields(new Set());
    setGroupBy(new Set());
    setFilters([]);
    setResult(null);
  }, [entityKey]);

  const runMutation = useMutation({
    mutationFn: async (): Promise<CustomReportResult> => {
      const res = await fetch('/api/reports/custom/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
        body: JSON.stringify({
          entity: entityKey,
          fields: Array.from(selectedFields),
          groupBy: groupBy.size > 0 ? Array.from(groupBy) : undefined,
          filters: filters
            .filter((f) => f.field && f.value !== '')
            .map((f) => ({ field: f.field, operator: f.operator, value: f.operator === 'in' ? f.value.split(',').map((v) => v.trim()) : f.value })),
          take: 200,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(body.message ?? 'Request failed');
      }
      return res.json();
    },
    onSuccess: setResult,
  });

  function toggleField(key: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroupBy(key: string) {
    setGroupBy((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addFilter() {
    if (!entity) return;
    const firstFilterable = entity.fields.find((f) => f.filterable);
    if (!firstFilterable) return;
    setFilters((prev) => [...prev, { field: firstFilterable.key, operator: 'eq', value: '' }]);
  }

  function updateFilter(index: number, patch: Partial<FilterRow>) {
    setFilters((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeFilter(index: number) {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }

  function downloadCsv() {
    if (!result || result.rows.length === 0) return;
    const csv = toCsv(result.rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-report-${entityKey}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canRun = entityKey && (selectedFields.size > 0 || groupBy.size > 0);
  const resultColumns = result?.rows[0] ? Object.keys(result.rows[0]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Custom Reports</h1>
        <p className="text-sm text-muted-foreground">
          Build an ad-hoc report against any of the entities below — pick fields, add filters, optionally group. Every
          entity/field here comes from a fixed, validated list; there is no free-text query surface.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="max-w-xs space-y-1.5">
            <label className="text-sm font-medium">Entity</label>
            <Select value={entityKey} onValueChange={setEntityKey}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an entity…" />
              </SelectTrigger>
              <SelectContent>
                {(entitiesQuery.data ?? []).map((e) => (
                  <SelectItem key={e.entity} value={e.entity}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {entitiesQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}

          {entity ? (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fields</label>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {entity.fields.map((field) => (
                    <label key={field.key} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={selectedFields.has(field.key)} onCheckedChange={() => toggleField(field.key)} />
                      {field.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Filters</label>
                  <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                    <Plus className="h-3.5 w-3.5" /> Add filter
                  </Button>
                </div>
                {filters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No filters — every row will be included.</p>
                ) : (
                  <div className="space-y-2">
                    {filters.map((filter, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Select value={filter.field} onValueChange={(v) => updateFilter(index, { field: v })}>
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {entity.fields
                              .filter((f) => f.filterable)
                              .map((f) => (
                                <SelectItem key={f.key} value={f.key}>
                                  {f.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Select value={filter.operator} onValueChange={(v) => updateFilter(index, { operator: v as FilterRow['operator'] })}>
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                              <SelectItem key={op} value={op}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={filter.value}
                          onChange={(e) => updateFilter(index, { value: e.target.value })}
                          placeholder="Value"
                          className="max-w-xs"
                        />
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeFilter(index)} aria-label="Remove filter">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Group by (optional)</label>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {entity.fields
                    .filter((f) => f.groupable)
                    .map((field) => (
                      <label key={field.key} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={groupBy.has(field.key)} onCheckedChange={() => toggleGroupBy(field.key)} />
                        {field.label}
                      </label>
                    ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => runMutation.mutate()} disabled={!canRun || runMutation.isPending}>
                  <Play className="h-4 w-4" /> {runMutation.isPending ? 'Running…' : 'Run report'}
                </Button>
                {result ? (
                  <Button type="button" variant="outline" onClick={downloadCsv} disabled={result.rows.length === 0}>
                    <Download className="h-4 w-4" /> Export CSV
                  </Button>
                ) : null}
                {runMutation.isError ? (
                  <span className="text-sm text-destructive">{(runMutation.error as Error).message}</span>
                ) : null}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">{result.totalCount} total rows</Badge>
              <span className="text-sm text-muted-foreground">showing up to 200</span>
            </div>
            {result.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No rows matched.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {resultColumns.map((col) => (
                        <TableHead key={col}>{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, i) => (
                      <TableRow key={i}>
                        {resultColumns.map((col) => (
                          <TableCell key={col}>{formatCell(row[col])}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
