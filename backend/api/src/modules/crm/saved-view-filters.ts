import { BadRequestException } from '@nestjs/common';
import { getPrismaClient, type CustomFieldEntityType, type SavedViewEntityType } from '@topiadesk/db';

/**
 * filters/sort are jsonb on SavedView, interpreted here against a FIXED,
 * per-entityType allowlist of real column names — never built into raw SQL
 * from the client. Mirrors the exact same principle as SavedDashboard.widgets
 * (schema.prisma) — a jsonb blob only ever selects among server-defined
 * keys/operators, it never becomes a query string.
 */
export type FilterOperator = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'contains';
const OPERATORS: ReadonlySet<string> = new Set<FilterOperator>(['eq', 'neq', 'in', 'gt', 'lt', 'contains']);

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface FilterTree {
  op: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

type FieldKind = 'string' | 'uuid' | 'enum' | 'number' | 'date' | 'boolean';

// One entry per real, filterable column — deliberately small. Extending an
// entity's filterable surface means adding a row here, never accepting an
// arbitrary field name from the request.
const ALLOWLISTS: Record<SavedViewEntityType, Record<string, FieldKind>> = {
  ACCOUNT: {
    status: 'enum',
    riskRating: 'enum',
    industryId: 'uuid',
    ownerId: 'uuid',
    city: 'string',
    country: 'string',
    name: 'string',
  },
  CONTACT: {
    accountId: 'uuid',
    carrierId: 'uuid',
    firstName: 'string',
    lastName: 'string',
    email: 'string',
    phone: 'string',
    isPrimary: 'boolean',
  },
  LEAD: {
    status: 'enum',
    source: 'enum',
    assignedToId: 'uuid',
    score: 'number',
    companyName: 'string',
    email: 'string',
    phone: 'string',
  },
  OPPORTUNITY: {
    accountId: 'uuid',
    ownerId: 'uuid',
    pipelineStageId: 'uuid',
    lineOfBusiness: 'string',
    amount: 'number',
    probability: 'number',
    expectedCloseDate: 'date',
  },
  TASK: {
    assigneeId: 'uuid',
    status: 'enum',
    priority: 'enum',
    accountId: 'uuid',
    dueDate: 'date',
  },
};

// Only entities with a customFields jsonb column accept `customFields.<key>`
// — matches CustomFieldEntityType exactly (Task has no customFields column).
const CUSTOM_FIELD_ENTITY_TYPES = new Set<SavedViewEntityType>(['ACCOUNT', 'CONTACT', 'LEAD', 'OPPORTUNITY']);

const OPERATORS_BY_KIND: Record<FieldKind, ReadonlySet<FilterOperator>> = {
  string: new Set(['eq', 'neq', 'in', 'contains']),
  uuid: new Set(['eq', 'neq', 'in']),
  enum: new Set(['eq', 'neq', 'in']),
  number: new Set(['eq', 'neq', 'in', 'gt', 'lt']),
  date: new Set(['eq', 'neq', 'gt', 'lt']),
  boolean: new Set(['eq', 'neq']),
};

const SORTABLE_META_FIELDS: ReadonlySet<string> = new Set(['id', 'createdAt', 'updatedAt']);

export function parseFilterTree(filters: unknown): FilterTree {
  if (filters === null || filters === undefined) return { op: 'AND', conditions: [] };
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw new BadRequestException('filters must be an object of the form { op, conditions }');
  }
  const raw = filters as Record<string, unknown>;
  if (raw.op !== 'AND' && raw.op !== 'OR') throw new BadRequestException('filters.op must be "AND" or "OR"');
  if (!Array.isArray(raw.conditions)) throw new BadRequestException('filters.conditions must be an array');

  const conditions = raw.conditions.map((c): FilterCondition => {
    if (typeof c !== 'object' || c === null) throw new BadRequestException('Each filter condition must be an object');
    const cond = c as Record<string, unknown>;
    if (typeof cond.field !== 'string') throw new BadRequestException('condition.field must be a string');
    if (typeof cond.operator !== 'string' || !OPERATORS.has(cond.operator)) {
      throw new BadRequestException(`condition.operator must be one of: ${[...OPERATORS].join(', ')}`);
    }
    return { field: cond.field, operator: cond.operator as FilterOperator, value: cond.value };
  });

  return { op: raw.op, conditions };
}

function parseSortSpecs(sort: unknown): SortSpec[] {
  if (sort === null || sort === undefined) return [];
  if (!Array.isArray(sort)) throw new BadRequestException('sort must be an array of { field, direction }');
  return sort.map((s): SortSpec => {
    if (typeof s !== 'object' || s === null) throw new BadRequestException('Each sort entry must be an object');
    const spec = s as Record<string, unknown>;
    if (typeof spec.field !== 'string') throw new BadRequestException('sort.field must be a string');
    if (spec.direction !== 'asc' && spec.direction !== 'desc') throw new BadRequestException('sort.direction must be "asc" or "desc"');
    return { field: spec.field, direction: spec.direction };
  });
}

async function activeCustomFieldKeys(entityType: SavedViewEntityType): Promise<Set<string>> {
  if (!CUSTOM_FIELD_ENTITY_TYPES.has(entityType)) return new Set();
  // SavedViewEntityType and CustomFieldEntityType are distinct Prisma enums
  // that happen to share literal values for ACCOUNT/CONTACT/LEAD/OPPORTUNITY
  // — safe here because CUSTOM_FIELD_ENTITY_TYPES excludes TASK, the only
  // SavedViewEntityType member without a CustomFieldEntityType counterpart.
  const definitions = await getPrismaClient().customFieldDefinition.findMany({
    where: { entityType: entityType as unknown as CustomFieldEntityType, isActive: true },
    select: { key: true },
  });
  return new Set(definitions.map((d) => d.key));
}

function assertFilterableField(entityType: SavedViewEntityType, field: string, customKeys: Set<string>): FieldKind | 'json' {
  if (field.startsWith('customFields.')) {
    const key = field.slice('customFields.'.length);
    if (!customKeys.has(key)) throw new BadRequestException(`Unknown or inactive custom field "${key}" for ${entityType}`);
    return 'json';
  }
  const kind = ALLOWLISTS[entityType][field];
  if (!kind) throw new BadRequestException(`Field "${field}" is not filterable on ${entityType}`);
  return kind;
}

function buildScalarClause(operator: FilterOperator, value: unknown): Record<string, unknown> {
  switch (operator) {
    case 'eq':
      return { equals: value };
    case 'neq':
      return { not: value };
    case 'in':
      if (!Array.isArray(value)) throw new BadRequestException('"in" requires an array value');
      return { in: value };
    case 'gt':
      return { gt: value };
    case 'lt':
      return { lt: value };
    case 'contains':
      return { contains: value, mode: 'insensitive' };
  }
}

function buildJsonClause(key: string, operator: FilterOperator, value: unknown): Record<string, unknown> {
  switch (operator) {
    case 'eq':
      return { customFields: { path: [key], equals: value } };
    case 'neq':
      return { NOT: { customFields: { path: [key], equals: value } } };
    case 'gt':
      return { customFields: { path: [key], gt: value } };
    case 'lt':
      return { customFields: { path: [key], lt: value } };
    case 'contains':
      return { customFields: { path: [key], string_contains: value } };
    case 'in':
      if (!Array.isArray(value)) throw new BadRequestException('"in" requires an array value');
      return { OR: value.map((v) => ({ customFields: { path: [key], equals: v } })) };
  }
}

/**
 * Returns a plain object shaped like the target model's Prisma WhereInput.
 * Callers cast it to the specific `Prisma.<Model>WhereInput` at the call
 * site — safe because every field name and operator has just been checked
 * against the fixed allowlist above, never passed through unvalidated.
 */
export async function buildSavedViewWhere(entityType: SavedViewEntityType, filters: unknown): Promise<Record<string, unknown>> {
  const tree = parseFilterTree(filters);
  if (tree.conditions.length === 0) return {};

  const customKeys = await activeCustomFieldKeys(entityType);
  const fragments = tree.conditions.map((condition) => {
    const kind = assertFilterableField(entityType, condition.field, customKeys);
    if (kind === 'json') {
      const key = condition.field.slice('customFields.'.length);
      return buildJsonClause(key, condition.operator, condition.value);
    }
    if (!OPERATORS_BY_KIND[kind].has(condition.operator)) {
      throw new BadRequestException(`Operator "${condition.operator}" is not supported for field "${condition.field}"`);
    }
    return { [condition.field]: buildScalarClause(condition.operator, condition.value) };
  });

  return tree.op === 'AND' ? { AND: fragments } : { OR: fragments };
}

export function buildSavedViewOrderBy(entityType: SavedViewEntityType, sort: unknown): Record<string, 'asc' | 'desc'>[] {
  const specs = parseSortSpecs(sort);
  const allowlist = ALLOWLISTS[entityType];
  return specs.map((spec) => {
    if (!SORTABLE_META_FIELDS.has(spec.field) && !allowlist[spec.field]) {
      throw new BadRequestException(`Field "${spec.field}" is not sortable on ${entityType}`);
    }
    return { [spec.field]: spec.direction };
  });
}
