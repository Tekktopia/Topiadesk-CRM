'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@topiadesk/ui';
import { formatReportValue } from '../_lib/format';
import type { ReportResult } from '../_lib/types';

const NUMERIC_FORMATS = new Set(['currency', 'number', 'percent', 'days']);

/**
 * Ground-truth view of a report run — always rendered regardless of whether
 * ReportBarChart also renders above it (per the build brief: the chart is a
 * bonus visualization, the table is the source of truth). Columns/labels/
 * formats come straight off the response's own `columns` array, never
 * hand-mapped per report.
 */
export function ReportResultTable({ result }: { result: ReportResult }) {
  if (result.rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No rows matched these filters.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {result.columns.map((column) => (
            <TableHead key={column.key} className={NUMERIC_FORMATS.has(column.format) ? 'text-right' : undefined}>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.rows.map((row, i) => (
          <TableRow key={i}>
            {result.columns.map((column) => (
              <TableCell
                key={column.key}
                className={NUMERIC_FORMATS.has(column.format) ? 'text-right tabular-nums' : undefined}
              >
                {formatReportValue(column.format, row[column.key] ?? null)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
