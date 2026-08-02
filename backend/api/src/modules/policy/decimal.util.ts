import type { Prisma } from '@topiadesk/db';

/**
 * Prisma's Decimal fields (`Prisma.Decimal`, from decimal.js) aren't plain
 * strings at the TYPE level, even though `Decimal.toJSON()` already renders
 * them as strings over the wire (NestJS's default JSON serialization calls
 * it implicitly). Response DTOs declare these fields as `string` for a
 * clean Swagger contract, so controllers convert explicitly here rather
 * than relying on an implicit runtime coercion the compiler can't see —
 * makes the DTO's declared type honest, not just accidentally correct.
 */
export function decimalToString<T extends Prisma.Decimal | null | undefined>(
  value: T,
): T extends null ? string | null : T extends undefined ? string | undefined : string {
  return (value === null || value === undefined ? value : value.toString()) as never;
}
