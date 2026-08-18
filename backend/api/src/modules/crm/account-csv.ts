import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { type Account, type AccountType, getPrismaClient } from '@topiadesk/db';

const EXPORT_COLUMNS = [
  'name',
  'accountType',
  'status',
  'city',
  'country',
  'riskRating',
  'source',
  'notes',
  'tags',
] as const;

const IMPORT_COLUMNS = new Set(['name', 'accountType', 'status', 'city', 'country', 'riskRating', 'source', 'notes', 'tags']);
const VALID_ACCOUNT_TYPES = new Set<AccountType>(['INDIVIDUAL', 'CORPORATE', 'HOUSEHOLD']);

export async function accountsToCsv(accounts: Account[]): Promise<string> {
  const rows = accounts.map((a) => ({
    name: a.name,
    accountType: a.accountType,
    status: a.status,
    city: a.city ?? '',
    country: a.country ?? '',
    riskRating: a.riskRating ?? '',
    source: a.source ?? '',
    notes: a.notes ?? '',
    tags: a.tags.join(';'),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}

interface ImportRow {
  name?: string;
  accountType?: string;
  status?: string;
  city?: string;
  country?: string;
  riskRating?: string;
  source?: string;
  notes?: string;
  tags?: string;
}

/**
 * Upserts by exact, case-insensitive name — the only bulk "import" path
 * that existed before this was a single find-or-create-by-name function
 * backing a mock third-party sync (see upsert-record.ts); this is the
 * user-facing equivalent for a CSV a broker actually uploads. Every row is
 * validated independently — one bad row is reported in `errors` and
 * skipped, not a whole-file failure.
 */
export async function importAccountsCsv(buffer: Buffer, ownerId: string): Promise<{ created: number; updated: number; errors: { row: number; message: string }[] }> {
  let records: ImportRow[];
  try {
    records = parse(buffer, { columns: (header: string[]) => header.map((h) => h.trim()), skip_empty_lines: true, trim: true }) as ImportRow[];
  } catch (err) {
    return { created: 0, updated: 0, errors: [{ row: 0, message: `Could not parse CSV: ${err instanceof Error ? err.message : String(err)}` }] };
  }

  const prisma = getPrismaClient();
  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (const [index, record] of records.entries()) {
    const rowNumber = index + 2; // +1 for 0-index, +1 for the header row
    const unknownColumns = Object.keys(record).filter((k) => !IMPORT_COLUMNS.has(k));
    if (unknownColumns.length > 0 && index === 0) {
      // Only worth flagging once — a header typo affects every row equally.
      errors.push({ row: 1, message: `Unrecognized column(s), ignored: ${unknownColumns.join(', ')}` });
    }

    const name = record.name?.trim();
    if (!name) {
      errors.push({ row: rowNumber, message: 'Missing required "name"' });
      continue;
    }
    const accountType = (record.accountType?.trim().toUpperCase() || 'CORPORATE') as AccountType;
    if (!VALID_ACCOUNT_TYPES.has(accountType)) {
      errors.push({ row: rowNumber, message: `Invalid accountType "${record.accountType}" — expected INDIVIDUAL, CORPORATE, or HOUSEHOLD` });
      continue;
    }

    const tags = record.tags ? record.tags.split(';').map((t) => t.trim()).filter(Boolean) : [];
    const data = {
      accountType,
      status: (record.status?.trim().toUpperCase() as never) || undefined,
      city: record.city?.trim() || undefined,
      country: record.country?.trim() || undefined,
      riskRating: (record.riskRating?.trim().toUpperCase() as never) || undefined,
      source: record.source?.trim() || undefined,
      notes: record.notes?.trim() || undefined,
      tags,
    };

    try {
      const existing = await prisma.account.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (existing) {
        await prisma.account.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await prisma.account.create({ data: { ...data, name, ownerId } });
        created += 1;
      }
    } catch (err) {
      errors.push({ row: rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { created, updated, errors };
}
