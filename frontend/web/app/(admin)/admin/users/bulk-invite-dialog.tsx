'use client';

import * as React from 'react';
import Papa from 'papaparse';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Upload, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { apiFetch, ApiError } from '../_lib/api';
import { useBranches, useDepartments } from '../_lib/queries';
import type { BranchDto, BulkInviteResultRow, BulkInviteUsersBody, DepartmentDto } from '../_lib/types';

const UNMAPPED = '__unmapped__';
const EMAIL_HINTS = ['email', 'e-mail', 'emailaddress'];
const NAME_HINTS = ['fullname', 'full name', 'name'];
const DEPARTMENT_HINTS = ['department', 'dept', 'department code'];
const BRANCH_HINTS = ['branch', 'branch code'];

function guessColumn(headers: string[], hints: string[]): string {
  const normalized = headers.map((h) => ({ h, norm: h.trim().toLowerCase() }));
  for (const hint of hints) {
    const match = normalized.find((n) => n.norm === hint || n.norm.replace(/[\s_-]/g, '') === hint.replace(/[\s_-]/g, ''));
    if (match) return match.h;
  }
  return UNMAPPED;
}

function resolveCode(raw: string | undefined, options: (DepartmentDto | BranchDto)[]): string | undefined {
  if (!raw?.trim()) return undefined;
  const term = raw.trim().toLowerCase();
  const match = options.find((o) => o.code.toLowerCase() === term || o.name.toLowerCase() === term);
  return match?.code;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type Step = 'upload' | 'map' | 'results';

interface MappedRow {
  raw: Record<string, string>;
  email: string;
  fullName: string;
  departmentCode?: string;
  branchCode?: string;
  valid: boolean;
}

export function BulkInviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = React.useState<Step>('upload');
  const [fileName, setFileName] = React.useState('');
  const [csvRows, setCsvRows] = React.useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [emailCol, setEmailCol] = React.useState(UNMAPPED);
  const [nameCol, setNameCol] = React.useState(UNMAPPED);
  const [deptCol, setDeptCol] = React.useState(UNMAPPED);
  const [branchCol, setBranchCol] = React.useState(UNMAPPED);
  const [results, setResults] = React.useState<BulkInviteResultRow[]>([]);

  const { data: departments } = useDepartments();
  const { data: branches } = useBranches();
  const queryClient = useQueryClient();

  function reset() {
    setStep('upload');
    setFileName('');
    setCsvRows([]);
    setHeaders([]);
    setEmailCol(UNMAPPED);
    setNameCol(UNMAPPED);
    setDeptCol(UNMAPPED);
    setBranchCol(UNMAPPED);
    setResults([]);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const fields = parsed.meta.fields ?? [];
        setHeaders(fields);
        setCsvRows(parsed.data);
        setEmailCol(guessColumn(fields, EMAIL_HINTS));
        setNameCol(guessColumn(fields, NAME_HINTS));
        setDeptCol(guessColumn(fields, DEPARTMENT_HINTS));
        setBranchCol(guessColumn(fields, BRANCH_HINTS));
        setStep('map');
      },
      error: (err) => toast.error(`Could not read CSV: ${err.message}`),
    });
  }

  const mappedRows: MappedRow[] = React.useMemo(() => {
    if (emailCol === UNMAPPED || nameCol === UNMAPPED) return [];
    return csvRows.map((raw) => {
      const email = (raw[emailCol] ?? '').trim();
      const fullName = (raw[nameCol] ?? '').trim();
      return {
        raw,
        email,
        fullName,
        departmentCode: deptCol !== UNMAPPED ? resolveCode(raw[deptCol], departments ?? []) : undefined,
        branchCode: branchCol !== UNMAPPED ? resolveCode(raw[branchCol], branches ?? []) : undefined,
        valid: Boolean(email) && isValidEmail(email) && Boolean(fullName),
      };
    });
  }, [csvRows, emailCol, nameCol, deptCol, branchCol, departments, branches]);

  const validRows = mappedRows.filter((r) => r.valid);
  const invalidCount = mappedRows.length - validRows.length;

  const submit = useMutation({
    mutationFn: () =>
      apiFetch<BulkInviteResultRow[]>('/api/admin/users/bulk-invite', {
        method: 'POST',
        body: JSON.stringify({
          rows: validRows.map((r) => ({ email: r.email, fullName: r.fullName, departmentCode: r.departmentCode, branchCode: r.branchCode })),
        } satisfies BulkInviteUsersBody),
      }),
    onSuccess: (rows) => {
      setResults(rows);
      setStep('results');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      const created = rows.filter((r) => r.status === 'created').length;
      toast.success(`${created} of ${rows.length} invited`);
    },
    onError: (err) => toast.error('Bulk invite failed', { description: err instanceof ApiError ? err.message : undefined }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk invite employees</DialogTitle>
          <DialogDescription>Upload a CSV with at least an email and full name column for each person you want to add.</DialogDescription>
        </DialogHeader>

        {step === 'upload' ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center hover:border-primary/50">
            <FileUp className="h-8 w-8 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Click to choose a CSV file</span>
            <span className="text-xs text-muted-foreground">First row must be a header row (e.g. Email, Full Name, Department, Branch)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        ) : null}

        {step === 'map' ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {fileName} — {csvRows.length} row{csvRows.length === 1 ? '' : 's'}. Match each CSV column below.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ColumnMapSelect label="Email *" headers={headers} value={emailCol} onChange={setEmailCol} />
              <ColumnMapSelect label="Full name *" headers={headers} value={nameCol} onChange={setNameCol} />
              <ColumnMapSelect label="Department" headers={headers} value={deptCol} onChange={setDeptCol} />
              <ColumnMapSelect label="Branch" headers={headers} value={branchCol} onChange={setBranchCol} />
            </div>

            {emailCol === UNMAPPED || nameCol === UNMAPPED ? (
              <p className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Map both Email and Full name to see a preview.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Full name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappedRows.map((row, i) => (
                      <TableRow key={i} className={row.valid ? undefined : 'opacity-60'}>
                        <TableCell>{row.email || '—'}</TableCell>
                        <TableCell>{row.fullName || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.departmentCode ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.branchCode ?? '—'}</TableCell>
                        <TableCell>
                          {row.valid ? (
                            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                          ) : (
                            <span title="Missing or invalid email/full name">
                              <XCircle className="h-4 w-4 text-destructive" aria-hidden />
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {invalidCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {invalidCount} row{invalidCount === 1 ? '' : 's'} will be skipped (missing/invalid email or full name).
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'results' ? (
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.email}>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'created' ? 'success' : r.status === 'skipped' ? 'secondary' : 'destructive'}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        <DialogFooter>
          {step === 'map' ? (
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || validRows.length === 0}
            >
              <Upload className="mr-2 h-4 w-4" aria-hidden />
              {submit.isPending ? 'Inviting…' : `Invite ${validRows.length} employee${validRows.length === 1 ? '' : 's'}`}
            </Button>
          ) : null}
          {step === 'results' ? <Button onClick={() => onOpenChange(false)}>Done</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnMapSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNMAPPED}>Not mapped</SelectItem>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
