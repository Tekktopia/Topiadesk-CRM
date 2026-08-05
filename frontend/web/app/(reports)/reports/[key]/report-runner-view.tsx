'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, Download, Play } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@topiadesk/ui';
import { DimensionSelect, NO_DIMENSION } from '../../_components/dimension-select';
import { DynamicFilterForm } from '../../_components/dynamic-filter-form';
import { ReportChart } from '../../_components/report-chart';
import { ReportResultTable } from '../../_components/report-result-table';
import { buildFiltersPayload, deriveFilterFields } from '../../_lib/filter-schema';
import { formatDateTime } from '../../_lib/format';
import { useExportReport, useReportCatalog, useRunReport } from '../../_lib/hooks';
import type { ReportExportFormat, ReportResult } from '../../_lib/types';

const PAGE_SIZE = 50;

/**
 * Report runner — filter form + dimension picker are entirely generated
 * from the live catalog entry (GET /api/reports), never hardcoded per
 * report key. `run()` and `handleExport()` both build the same filters
 * object from the same schema-derived fields, so what the user sees in the
 * form is exactly what reaches the backend either way.
 */
export function ReportRunnerView({ reportKey }: { reportKey: string }) {
  const catalogQuery = useReportCatalog();
  const definition = catalogQuery.data?.find((r) => r.key === reportKey);
  const fields = React.useMemo(() => deriveFilterFields(definition?.filterSchema), [definition]);

  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({});
  const [dimension, setDimension] = React.useState<string>(NO_DIMENSION);
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState<ReportResult | null>(null);

  const runMutation = useRunReport(reportKey);
  const exportMutation = useExportReport(reportKey);

  function currentDimension(): string | undefined {
    return dimension === NO_DIMENSION ? undefined : dimension;
  }

  function run(nextPage: number) {
    runMutation.mutate(
      { filters: buildFiltersPayload(fields, filterValues), dimension: currentDimension(), page: nextPage, pageSize: PAGE_SIZE },
      {
        onSuccess: (data) => {
          setResult(data);
          setPage(nextPage);
        },
      },
    );
  }

  function handleExport(format: ReportExportFormat) {
    exportMutation.mutate({ format, filters: buildFiltersPayload(fields, filterValues), dimension: currentDimension() });
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.totalRowCount / PAGE_SIZE)) : 1;

  if (catalogQuery.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!definition) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {catalogQuery.isError ? "Couldn't load the report catalog." : `Unknown report key "${reportKey}".`}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{definition.name}</h1>
          <p className="text-sm text-muted-foreground">{definition.description}</p>
        </div>
        <Badge variant="outline">{definition.category}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Generated from this report&apos;s own filter schema — there is no free-text query option.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DynamicFilterForm
            fields={fields}
            values={filterValues}
            onChange={(key, value) => setFilterValues((prev) => ({ ...prev, [key]: value }))}
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <DimensionSelect dimensions={definition.allowedDimensions} value={dimension} onChange={setDimension} />
            </div>
            <Button onClick={() => run(1)} disabled={runMutation.isPending}>
              <Play className="h-4 w-4" aria-hidden /> {runMutation.isPending ? 'Running…' : 'Run report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Results</CardTitle>
              <CardDescription>
                {result.totalRowCount} row{result.totalRowCount === 1 ? '' : 's'} · generated {formatDateTime(result.generatedAt)}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exportMutation.isPending}>
                <Download className="h-4 w-4" aria-hidden /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')} disabled={exportMutation.isPending}>
                <Download className="h-4 w-4" aria-hidden /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={exportMutation.isPending}>
                <Download className="h-4 w-4" aria-hidden /> PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ReportChart type={definition.defaultChartType} result={result} />
            <ReportResultTable result={result} />
            {result.totalRowCount > PAGE_SIZE ? (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1 || runMutation.isPending} onClick={() => run(page - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages || runMutation.isPending} onClick={() => run(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" aria-hidden /> All reports
    </Link>
  );
}
