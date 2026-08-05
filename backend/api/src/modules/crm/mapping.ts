import type { Opportunity, OpportunityMarketSubmission, SalesQuota } from '@topiadesk/db';
import type { OpportunityResponseDto } from './dto/opportunity.dto';
import type { MarketSubmissionResponseDto } from './dto/opportunity-market-submission.dto';
import type { SalesQuotaResponseDto } from './dto/sales-quota.dto';

/** Prisma returns Decimal fields as Decimal.js instances — responses need plain strings (see dashboards.controller.ts precedent). */
export function toOpportunityDto(o: Opportunity): OpportunityResponseDto {
  return { ...o, amount: o.amount.toString() };
}

export function toMarketSubmissionDto(m: OpportunityMarketSubmission): MarketSubmissionResponseDto {
  return { ...m, quotedPremium: m.quotedPremium ? m.quotedPremium.toString() : null };
}

export function toSalesQuotaDto(q: SalesQuota): SalesQuotaResponseDto {
  return { ...q, targetAmount: q.targetAmount.toString() };
}
