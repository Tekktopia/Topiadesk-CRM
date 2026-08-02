import type { Opportunity, OpportunityMarketSubmission } from '@topiadesk/db';
import type { OpportunityResponseDto } from './dto/opportunity.dto';
import type { MarketSubmissionResponseDto } from './dto/opportunity-market-submission.dto';

/** Prisma returns Decimal fields as Decimal.js instances — responses need plain strings (see dashboards.controller.ts precedent). */
export function toOpportunityDto(o: Opportunity): OpportunityResponseDto {
  return { ...o, amount: o.amount.toString() };
}

export function toMarketSubmissionDto(m: OpportunityMarketSubmission): MarketSubmissionResponseDto {
  return { ...m, quotedPremium: m.quotedPremium ? m.quotedPremium.toString() : null };
}
