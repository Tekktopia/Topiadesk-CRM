import { queryRawWithRlsContext } from './rls-raw-query.util';

/**
 * Pragmatic rule-based matching, not ML — per the approved research spec.
 * Tiers are priority-ordered (EXACT > STRONG > POSSIBLE); a candidate is
 * reported once, under its highest-confidence tier only. Advisory only —
 * callers never block creation or auto-merge on these results.
 */
export type DuplicateTier = 'EXACT' | 'STRONG' | 'POSSIBLE';

export interface DuplicateMatch {
  id: string;
  displayName: string;
  matchedOn: string[];
}

export interface DuplicateGroup {
  tier: DuplicateTier;
  matches: DuplicateMatch[];
}

interface Row {
  id: string;
  display_name: string;
  matched_on: string;
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizePhone(v: string): string {
  return v.replace(/\D/g, '');
}

function normalizeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Collapses same-id rows into one match, unioning matchedOn; drops ids already claimed by a higher-priority tier. */
function mergeRows(rows: Row[], exclude: ReadonlySet<string>): DuplicateMatch[] {
  const byId = new Map<string, DuplicateMatch>();
  for (const row of rows) {
    if (exclude.has(row.id)) continue;
    const existing = byId.get(row.id);
    if (existing) {
      if (!existing.matchedOn.includes(row.matched_on)) existing.matchedOn.push(row.matched_on);
    } else {
      byId.set(row.id, { id: row.id, displayName: row.display_name, matchedOn: [row.matched_on] });
    }
  }
  return [...byId.values()];
}

/**
 * Account has no email/phone column of its own — EXACT/STRONG signals come
 * from its Contacts (the natural "who do we already know at this company"
 * check), matching how accounts.controller.ts already frames Contact as
 * always reached through an Account.
 */
export async function checkAccountDuplicates(params: { name?: string; email?: string; phone?: string }): Promise<DuplicateGroup[]> {
  const normEmail = params.email ? normalizeEmail(params.email) : null;
  const normPhone = params.phone ? normalizePhone(params.phone) : null;
  const normName = params.name ? normalizeName(params.name) : null;

  const exactRows: Row[] = [];
  if (normEmail) {
    exactRows.push(
      ...(await queryRawWithRlsContext<Row[]>`
        SELECT DISTINCT a.id, a.name AS display_name, 'email' AS matched_on
        FROM accounts a JOIN contacts c ON c.account_id = a.id
        WHERE lower(trim(c.email)) = ${normEmail}`),
    );
  }
  if (normPhone) {
    exactRows.push(
      ...(await queryRawWithRlsContext<Row[]>`
        SELECT DISTINCT a.id, a.name AS display_name, 'phone' AS matched_on
        FROM accounts a JOIN contacts c ON c.account_id = a.id
        WHERE regexp_replace(c.phone, '\D', '', 'g') = ${normPhone}`),
    );
  }
  const exactMatches = mergeRows(exactRows, new Set());
  const exactSet = new Set(exactMatches.map((m) => m.id));

  let strongMatches: DuplicateMatch[] = [];
  if (normName && (normEmail || normPhone)) {
    const strongRows: Row[] = [];
    if (normEmail) {
      strongRows.push(
        ...(await queryRawWithRlsContext<Row[]>`
          SELECT DISTINCT a.id, a.name AS display_name, 'name+email' AS matched_on
          FROM accounts a JOIN contacts c ON c.account_id = a.id
          WHERE lower(trim(a.name)) = ${normName} AND lower(trim(c.email)) = ${normEmail}`),
      );
    }
    if (normPhone) {
      strongRows.push(
        ...(await queryRawWithRlsContext<Row[]>`
          SELECT DISTINCT a.id, a.name AS display_name, 'name+phone' AS matched_on
          FROM accounts a JOIN contacts c ON c.account_id = a.id
          WHERE lower(trim(a.name)) = ${normName} AND regexp_replace(c.phone, '\D', '', 'g') = ${normPhone}`),
      );
    }
    strongMatches = mergeRows(strongRows, exactSet);
  }
  const strongSet = new Set(strongMatches.map((m) => m.id));

  let possibleMatches: DuplicateMatch[] = [];
  if (normName) {
    const possibleRows = await queryRawWithRlsContext<Row[]>`
      SELECT id, name AS display_name, 'name_similarity' AS matched_on
      FROM accounts
      WHERE name % ${normName}
      ORDER BY similarity(name, ${normName}) DESC
      LIMIT 10`;
    possibleMatches = mergeRows(possibleRows, new Set([...exactSet, ...strongSet]));
  }

  return [
    { tier: 'EXACT', matches: exactMatches },
    { tier: 'STRONG', matches: strongMatches },
    { tier: 'POSSIBLE', matches: possibleMatches },
  ];
}

export async function checkContactDuplicates(params: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}): Promise<DuplicateGroup[]> {
  const normEmail = params.email ? normalizeEmail(params.email) : null;
  const normPhone = params.phone ? normalizePhone(params.phone) : null;
  const normName = params.firstName && params.lastName ? normalizeName(`${params.firstName} ${params.lastName}`) : null;

  const exactRows: Row[] = [];
  if (normEmail) {
    exactRows.push(
      ...(await queryRawWithRlsContext<Row[]>`
        SELECT id, first_name || ' ' || last_name AS display_name, 'email' AS matched_on
        FROM contacts WHERE lower(trim(email)) = ${normEmail}`),
    );
  }
  if (normPhone) {
    exactRows.push(
      ...(await queryRawWithRlsContext<Row[]>`
        SELECT id, first_name || ' ' || last_name AS display_name, 'phone' AS matched_on
        FROM contacts WHERE regexp_replace(phone, '\D', '', 'g') = ${normPhone}`),
    );
  }
  const exactMatches = mergeRows(exactRows, new Set());
  const exactSet = new Set(exactMatches.map((m) => m.id));

  let strongMatches: DuplicateMatch[] = [];
  if (normName && (normEmail || normPhone)) {
    const strongRows: Row[] = [];
    if (normEmail) {
      strongRows.push(
        ...(await queryRawWithRlsContext<Row[]>`
          SELECT id, first_name || ' ' || last_name AS display_name, 'name+email' AS matched_on
          FROM contacts WHERE lower(trim(first_name || ' ' || last_name)) = ${normName} AND lower(trim(email)) = ${normEmail}`),
      );
    }
    if (normPhone) {
      strongRows.push(
        ...(await queryRawWithRlsContext<Row[]>`
          SELECT id, first_name || ' ' || last_name AS display_name, 'name+phone' AS matched_on
          FROM contacts WHERE lower(trim(first_name || ' ' || last_name)) = ${normName} AND regexp_replace(phone, '\D', '', 'g') = ${normPhone}`),
      );
    }
    strongMatches = mergeRows(strongRows, exactSet);
  }
  const strongSet = new Set(strongMatches.map((m) => m.id));

  let possibleMatches: DuplicateMatch[] = [];
  if (normName) {
    const possibleRows = await queryRawWithRlsContext<Row[]>`
      SELECT id, first_name || ' ' || last_name AS display_name, 'name_similarity' AS matched_on
      FROM contacts
      WHERE (first_name || ' ' || last_name) % ${normName}
      ORDER BY similarity(first_name || ' ' || last_name, ${normName}) DESC
      LIMIT 10`;
    possibleMatches = mergeRows(possibleRows, new Set([...exactSet, ...strongSet]));
  }

  return [
    { tier: 'EXACT', matches: exactMatches },
    { tier: 'STRONG', matches: strongMatches },
    { tier: 'POSSIBLE', matches: possibleMatches },
  ];
}

/**
 * companyName is accepted (matches the endpoint's query contract) but not
 * currently factored into tier classification — leads.company_name has no
 * supporting trigram index (only full-name does, see the pg_trgm migration),
 * and the three tiers above are already a faithful implementation of the
 * approved spec's EXACT/STRONG/POSSIBLE definitions without it. Left as a
 * documented scope note rather than speculatively extending the tiers.
 */
export async function checkLeadDuplicates(params: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}): Promise<DuplicateGroup[]> {
  const normEmail = params.email ? normalizeEmail(params.email) : null;
  const normPhone = params.phone ? normalizePhone(params.phone) : null;
  const normName = params.firstName && params.lastName ? normalizeName(`${params.firstName} ${params.lastName}`) : null;

  const exactRows: Row[] = [];
  if (normEmail) {
    exactRows.push(
      ...(await queryRawWithRlsContext<Row[]>`
        SELECT id, first_name || ' ' || last_name AS display_name, 'email' AS matched_on
        FROM leads WHERE lower(trim(email)) = ${normEmail}`),
    );
  }
  if (normPhone) {
    exactRows.push(
      ...(await queryRawWithRlsContext<Row[]>`
        SELECT id, first_name || ' ' || last_name AS display_name, 'phone' AS matched_on
        FROM leads WHERE regexp_replace(phone, '\D', '', 'g') = ${normPhone}`),
    );
  }
  const exactMatches = mergeRows(exactRows, new Set());
  const exactSet = new Set(exactMatches.map((m) => m.id));

  let strongMatches: DuplicateMatch[] = [];
  if (normName && (normEmail || normPhone)) {
    const strongRows: Row[] = [];
    if (normEmail) {
      strongRows.push(
        ...(await queryRawWithRlsContext<Row[]>`
          SELECT id, first_name || ' ' || last_name AS display_name, 'name+email' AS matched_on
          FROM leads WHERE lower(trim(first_name || ' ' || last_name)) = ${normName} AND lower(trim(email)) = ${normEmail}`),
      );
    }
    if (normPhone) {
      strongRows.push(
        ...(await queryRawWithRlsContext<Row[]>`
          SELECT id, first_name || ' ' || last_name AS display_name, 'name+phone' AS matched_on
          FROM leads WHERE lower(trim(first_name || ' ' || last_name)) = ${normName} AND regexp_replace(phone, '\D', '', 'g') = ${normPhone}`),
      );
    }
    strongMatches = mergeRows(strongRows, exactSet);
  }
  const strongSet = new Set(strongMatches.map((m) => m.id));

  let possibleMatches: DuplicateMatch[] = [];
  if (normName) {
    const possibleRows = await queryRawWithRlsContext<Row[]>`
      SELECT id, first_name || ' ' || last_name AS display_name, 'name_similarity' AS matched_on
      FROM leads
      WHERE (first_name || ' ' || last_name) % ${normName}
      ORDER BY similarity(first_name || ' ' || last_name, ${normName}) DESC
      LIMIT 10`;
    possibleMatches = mergeRows(possibleRows, new Set([...exactSet, ...strongSet]));
  }

  return [
    { tier: 'EXACT', matches: exactMatches },
    { tier: 'STRONG', matches: strongMatches },
    { tier: 'POSSIBLE', matches: possibleMatches },
  ];
}
