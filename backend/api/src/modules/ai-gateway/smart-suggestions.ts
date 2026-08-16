/**
 * Smart suggestions engine — analyzes account/opportunity data and surfaces
 * actionable recommendations without over-querying. Keeps recommendations
 * lightweight and conversational.
 */

export interface Suggestion {
  type: 'renewal' | 'stale' | 'risk' | 'opportunity';
  priority: 'high' | 'medium' | 'low';
  message: string;
}

/**
 * Structural subset of getAccountSummary's Prisma selection — only the
 * fields this file reads. Declared here rather than importing Prisma's
 * generated payload type so the two aren't coupled: a `select` gaining a
 * field shouldn't touch this, and anything narrower fails to compile at
 * the call site, which is the check that matters.
 *
 * `Date | string` on the date fields is deliberate: this runs both on the
 * live Prisma result (real `Date`s) and, via the chat tool boundary, on a
 * JSON round-trip where they arrive as ISO strings.
 */
export interface AccountSuggestionInput {
  name: string;
  status: string;
  healthScore: number | null;
  kycStatus: string;
  kycExpiryDate: Date | string | null;
  policies: Array<{ renewalSchedule: { renewalDueDate: Date | string } | null }>;
  opportunities: Array<unknown>;
  _count: { policies: number; opportunities: number };
}

/** Analyze account details and surface suggestions. Reads only the fields declared above — no extra queries. */
export function suggestForAccount(account: AccountSuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86_400_000);

  // 1. Renewals within 30 days
  const renewalsAt30 = account.policies.filter((p) => {
    if (!p.renewalSchedule?.renewalDueDate) return false;
    const dueDate = new Date(p.renewalSchedule.renewalDueDate);
    return dueDate > now && dueDate <= thirtyDaysFromNow;
  });

  if (renewalsAt30.length > 0) {
    suggestions.push({
      type: 'renewal',
      priority: 'high',
      message: `${renewalsAt30.length} polic${renewalsAt30.length === 1 ? 'y' : 'ies'} renewing within 30 days — prioritize contact.`,
    });
  }

  // 2. KYC expiring soon
  if (account.kycExpiryDate) {
    const daysUntilExpiry = Math.ceil((new Date(account.kycExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 60) {
      suggestions.push({
        type: 'risk',
        priority: 'high',
        message: `KYC expires in ${daysUntilExpiry} days — renewal policies may lock.`,
      });
    }
  }

  // 3. Low health score
  if (account.healthScore !== null && account.healthScore < 40) {
    suggestions.push({
      type: 'risk',
      priority: 'high',
      message: `Health score is low (${account.healthScore}/100) — account needs attention.`,
    });
  }

  // 4. Many opportunities but high value potential
  if (account.opportunities.length > 3 && account._count.policies > 5) {
    suggestions.push({
      type: 'opportunity',
      priority: 'medium',
      message: `Cross-sell opportunity: ${account._count.policies} policies + ${account.opportunities.length} open deals.`,
    });
  }

  // 5. Account at risk or inactive
  if (account.status === 'AT_RISK' || account.status === 'INACTIVE') {
    suggestions.push({
      type: 'stale',
      priority: 'high',
      message: `Account status is ${account.status} — requires intervention.`,
    });
  }

  return suggestions.slice(0, 2); // Return top 2 suggestions
}

/**
 * Structural subset of the opportunity selection this file reads.
 *
 * `amount` accepts all three forms it genuinely takes: a Prisma `Decimal`
 * object when called directly off a query, and a string (Decimal's JSON
 * form) or number once it has crossed the chat-tool boundary. `Number()`
 * handles all three. Dates are `Date | string` for the same reason.
 */
export interface OpportunitySuggestionInput {
  name: string;
  amount: number | string | { toString(): string };
  currency: string;
  expectedCloseDate: Date | string;
  /** Null for closed deals and until refresh-deal-health.job.ts first runs. */
  dealHealthScore: number | null;
  pipelineStage: { name: string; isWon: boolean; isLost: boolean };
}

/**
 * Analyze an opportunity and surface suggestions.
 *
 * Staleness comes from the existing `dealHealthScore` rather than a fresh
 * heuristic: the worker (refresh-deal-health.job.ts) already averages
 * days-past-expectedCloseDate with days-since-the-last `Activity.occurredAt`
 * on an hourly cadence, and dashboards read the same number. An earlier
 * draft here invented its own "stalled if updatedAt is 30+ days old" rule,
 * which is both a second competing definition of the same idea and simply
 * wrong — `updatedAt` moves on ANY field edit, so silently re-saving a deal
 * makes it look freshly engaged. Where a real computed signal exists, use
 * it; see the SLA-metrics case in [[chat-tool-runtime-verification-recipe]]
 * for the same mistake made worse.
 *
 * A null score is reported as "not scored yet", never as healthy.
 */
export function suggestForOpportunity(opportunity: OpportunitySuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const now = new Date();
  const isClosed = opportunity.pipelineStage.isWon || opportunity.pipelineStage.isLost;

  // 1. Poor deal health on an open deal. Thresholds mirror the job's own
  //    banding (its overdue sub-score drops to 60 past the due date, 30
  //    past a week), so "below 50" means genuinely both-signals-bad.
  if (!isClosed && opportunity.dealHealthScore !== null) {
    if (opportunity.dealHealthScore < 50) {
      suggestions.push({
        type: 'stale',
        priority: 'high',
        message: `Deal health is ${opportunity.dealHealthScore}/100 — overdue and/or no recent contact. Worth a follow-up.`,
      });
    } else if (opportunity.dealHealthScore < 70) {
      suggestions.push({
        type: 'stale',
        priority: 'medium',
        message: `Deal health is ${opportunity.dealHealthScore}/100 — starting to drift.`,
      });
    }
  }

  // 2. Past its expected close date and still open.
  const expectedClose = new Date(opportunity.expectedCloseDate);
  if (!isClosed && !isNaN(expectedClose.getTime()) && expectedClose < now) {
    const daysOverdue = Math.floor((now.getTime() - expectedClose.getTime()) / (1000 * 60 * 60 * 24));
    suggestions.push({
      type: 'opportunity',
      priority: 'high',
      message: `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past the expected close date — update the stage or push the date out.`,
    });
  }

  // 3. Large open deal worth prioritizing. Formatted in the record's OWN
  //    currency (NGN by default in this schema) — an earlier draft hardcoded
  //    USD, which would have misreported every naira figure in the book.
  const amount = Number(String(opportunity.amount));
  if (!isClosed && !isNaN(amount) && amount >= LARGE_DEAL_THRESHOLD) {
    suggestions.push({
      type: 'opportunity',
      priority: 'medium',
      message: `Large deal at ${formatMoney(amount, opportunity.currency)} — worth prioritizing.`,
    });
  }

  return suggestions.slice(0, 2);
}

/** Deals at or above this (in the record's own currency) are flagged as worth prioritizing. Deliberately a plain constant, not a per-tenant setting — there's no configuration surface for it yet, and inventing one silently would be worse than a stated default. */
const LARGE_DEAL_THRESHOLD = 10_000_000;

function formatMoney(amount: number, currency: string): string {
  try {
    return amount.toLocaleString('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    // Intl throws on an unrecognized currency code; a bare number plus the
    // raw code is still honest, just unformatted.
    return `${amount.toLocaleString()} ${currency}`;
  }
}

/**
 * Format suggestions for natural conversation. Takes the widened shape the
 * chat-tool boundary produces (JSON round-trip loses the literal union
 * types) rather than `Suggestion[]` directly.
 */
export function formatSuggestions(suggestions: Array<{ priority: string; message: string }>): string | null {
  if (suggestions.length === 0) return null;

  const high = suggestions.filter((s) => s.priority === 'high');
  const toShow = high.length > 0 ? high.slice(0, 2) : suggestions.slice(0, 2);

  if (toShow.length === 0) return null;

  const parts = ['💡 **Quick thoughts**:'];
  for (const s of toShow) {
    parts.push(`• ${s.message}`);
  }
  return parts.join('\n');
}
