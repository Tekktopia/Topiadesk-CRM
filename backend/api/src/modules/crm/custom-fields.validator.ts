import { BadRequestException } from '@nestjs/common';
import { getPrismaClient, type CustomFieldDefinition, type CustomFieldEntityType } from '@topiadesk/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * customFields is a jsonb column, not an EAV table (see schema.prisma's
 * Phase 2 — CRM enhancements comment) — Prisma/Postgres apply no schema to
 * its contents, so every write has to be checked here against the active
 * CustomFieldDefinition rows for the entity before it lands in the column.
 * Called from Account/Contact/Lead/Opportunity controllers' create/update
 * handlers — one shared helper rather than duplicating this four times.
 *
 * PATCH semantics: `submitted` replaces the whole customFields object (like
 * every other field on these DTOs), it is not a per-key merge into the
 * existing value — so isRequired is only enforced on create; a PATCH that
 * doesn't touch customFields at all (submitted === undefined) is always
 * allowed through untouched.
 */
export async function validateCustomFields(
  entityType: CustomFieldEntityType,
  submitted: Record<string, unknown> | undefined,
  options: { isCreate: boolean },
): Promise<void> {
  if (submitted === undefined) return;

  const definitions = await getPrismaClient().customFieldDefinition.findMany({
    where: { entityType, isActive: true },
  });
  const byKey = new Map(definitions.map((d) => [d.key, d]));

  for (const key of Object.keys(submitted)) {
    if (!byKey.has(key)) {
      throw new BadRequestException(`Unknown custom field "${key}" for ${entityType}`);
    }
  }

  for (const def of definitions) {
    const isProvided = Object.prototype.hasOwnProperty.call(submitted, def.key);
    if (!isProvided) {
      if (options.isCreate && def.isRequired) {
        throw new BadRequestException(`Custom field "${def.key}" is required`);
      }
      continue;
    }
    const value = submitted[def.key];
    if (value === null || value === undefined) {
      if (def.isRequired) throw new BadRequestException(`Custom field "${def.key}" is required`);
      continue;
    }
    assertValueMatchesType(def, value);
  }
}

function assertValueMatchesType(def: CustomFieldDefinition, value: unknown): void {
  switch (def.fieldType) {
    case 'TEXT':
    case 'TEXTAREA':
    case 'URL':
      if (typeof value !== 'string') throw new BadRequestException(`Custom field "${def.key}" must be a string`);
      break;
    case 'NUMBER':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new BadRequestException(`Custom field "${def.key}" must be an integer`);
      }
      break;
    case 'DECIMAL':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`Custom field "${def.key}" must be a number`);
      }
      break;
    case 'BOOLEAN':
      if (typeof value !== 'boolean') throw new BadRequestException(`Custom field "${def.key}" must be a boolean`);
      break;
    case 'DATE':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new BadRequestException(`Custom field "${def.key}" must be an ISO date string`);
      }
      break;
    case 'USER_REFERENCE':
      if (typeof value !== 'string' || !UUID_RE.test(value)) {
        throw new BadRequestException(`Custom field "${def.key}" must be a user id`);
      }
      break;
    case 'SELECT': {
      const options = parseOptions(def);
      if (typeof value !== 'string' || !options.includes(value)) {
        throw new BadRequestException(`Custom field "${def.key}" must be one of: ${options.join(', ')}`);
      }
      break;
    }
    case 'MULTI_SELECT': {
      const options = parseOptions(def);
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && options.includes(v))) {
        throw new BadRequestException(`Custom field "${def.key}" must be an array of: ${options.join(', ')}`);
      }
      break;
    }
  }
}

function parseOptions(def: CustomFieldDefinition): string[] {
  const raw = def.options;
  if (!Array.isArray(raw) || !raw.every((o) => typeof o === 'string')) {
    // A SELECT/MULTI_SELECT definition without a valid options array is a
    // data-entry mistake on the definition itself, not the submitted value —
    // fail closed rather than silently accepting anything.
    throw new BadRequestException(`Custom field "${def.key}" has no valid options configured`);
  }
  return raw;
}
