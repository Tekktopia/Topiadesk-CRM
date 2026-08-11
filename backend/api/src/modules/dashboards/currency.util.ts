import { getPrismaClient } from '@topiadesk/db';

/** The org's base currency — Policy.currency/Opportunity.currency both default to this, and it never has its own ExchangeRate row (its implicit rate is always 1). */
export const BASE_CURRENCY = 'NGN';

/**
 * Loads every ExchangeRate row into a currencyCode->rateToBase map, with
 * the base currency itself pre-seeded at 1 (see ExchangeRate's schema
 * comment) — one query per dashboard request, not cached, since rates
 * change rarely enough that a per-request read is cheap and always
 * current (no staleness window to reason about).
 */
export async function loadExchangeRates(): Promise<Map<string, number>> {
  const rows = await getPrismaClient().exchangeRate.findMany();
  const rates = new Map<string, number>([[BASE_CURRENCY, 1]]);
  for (const row of rows) rates.set(row.currencyCode, Number(row.rateToBase));
  return rates;
}

/**
 * Converts an amount in `currencyCode` into the base currency so mixed-
 * currency Opportunity rows can be safely summed into one total (see
 * dashboards.controller.ts's pipeline/forecast/trend aggregations, which
 * previously raw-summed Opportunity.amount with no currency awareness at
 * all). An unconfigured currency (no ExchangeRate row, and not the base
 * currency) falls back to a 1:1 rate rather than silently zeroing the
 * amount out of the total — degrades honestly (a wrong-but-visible number)
 * instead of a wrong-and-invisible one.
 */
export function toBaseCurrency(amount: number, currencyCode: string, rates: Map<string, number>): number {
  const rate = rates.get(currencyCode) ?? 1;
  return amount * rate;
}
