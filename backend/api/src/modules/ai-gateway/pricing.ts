/**
 * Per-million-token USD pricing, keyed by the exact model string
 * AI_GATEWAY_MODEL is set to. This is what turns the org spend cap from
 * decorative into real — keep it in sync with
 * https://platform.claude.com/docs/en/about-claude/pricing whenever
 * Anthropic revises rates or AI_GATEWAY_MODEL changes.
 *
 * claude-sonnet-5 has a $2/$10-per-MTok introductory rate through
 * 2026-08-31; the $3/$15 standard rate below is used deliberately instead
 * — the org cap check is a running total across the WHOLE month, so
 * pricing this conservatively (higher) avoids a scenario where costs are
 * under-recorded during the introductory window and then the cap logic
 * has to silently start being "more correct" (and more restrictive) the
 * day introductory pricing ends. Update the comment/rate together if this
 * is ever changed to track the introductory price instead.
 */
const PRICING_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-opus-5': { input: 5.0, output: 25.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
};

// Used if AI_GATEWAY_MODEL is set to a string not in the table above, so
// spend is still tracked (conservatively, at the highest known rate)
// instead of silently recorded as $0 and defeating the cap entirely.
const FALLBACK_RATE = { input: 5.0, output: 25.0 };

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const rate = PRICING_USD_PER_MILLION_TOKENS[model] ?? FALLBACK_RATE;
  const cost = (tokensIn / 1_000_000) * rate.input + (tokensOut / 1_000_000) * rate.output;
  // AiUsageLedger.estimatedCostUsd is Decimal(10,4) — round to match.
  return Math.round(cost * 10_000) / 10_000;
}

/**
 * Voyage AI per-million-token USD pricing — embeddings have no input/output
 * split (unlike Claude completions), just one `total_tokens` count. Source:
 * https://docs.voyageai.com/docs/pricing (checked 2026-08-03).
 *
 * Routed into the SAME AI_ORG_MONTHLY_SPEND_CAP_USD pool as Claude spend
 * (ai-gateway.service.ts's enforceOrgMonthlyCap sums AiUsageLedger across
 * every AiFeature, Voyage-backed ones included) — deliberately not a
 * separate cap, per the build brief.
 *
 * Priced at the real post-free-tier rate rather than crediting Voyage's
 * "first 200M tokens free" allowance as $0 — same reasoning as the
 * introductory-vs-standard Claude pricing decision above: treating the free
 * tier as costless here would make the org cap silently start being "more
 * correct" (and more restrictive) the day the free allowance runs out,
 * instead of being conservative and meaningful from day one.
 */
const VOYAGE_PRICING_USD_PER_MILLION_TOKENS: Record<string, number> = {
  'voyage-4': 0.06,
};

// voyage-code-3's rate ($0.18/M) — the highest of Voyage's current-generation
// models — used if VOYAGE_MODEL is ever pointed at a model not in the table
// above, same "stay conservative rather than under-record spend" reasoning
// as ai-gateway's own FALLBACK_RATE.
const VOYAGE_FALLBACK_RATE = 0.18;

export function estimateVoyageCostUsd(model: string, totalTokens: number): number {
  const rate = VOYAGE_PRICING_USD_PER_MILLION_TOKENS[model] ?? VOYAGE_FALLBACK_RATE;
  const cost = (totalTokens / 1_000_000) * rate;
  return Math.round(cost * 10_000) / 10_000;
}
