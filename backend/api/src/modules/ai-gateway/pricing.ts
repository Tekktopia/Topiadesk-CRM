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
