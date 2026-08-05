import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { SearchQueryDto, SearchResponseDto, type SearchResultDto } from './dto/search.dto';

/**
 * Global (⌘K) search — one endpoint fanning out across every entity type an
 * agent actually needs to jump to, addressing a real gap: before this,
 * free-text search existed on 3 of ~28 list pages and nowhere cross-entity,
 * so there was no way to find a case/claim/policy by number, or an
 * opportunity/carrier/campaign by name, without knowing which module it
 * lived in first.
 *
 * No @RequirePermission here deliberately — this fans out across many
 * resource types with different grants, so a single decorator can't gate
 * it correctly. Each sub-query below runs through the same RLS-scoped
 * getPrismaClient() every other endpoint uses; a user with no grant on a
 * given table gets zero rows from that table's slice, same as browsing its
 * list page directly would. @UseGuards(PermissionGuard) with no
 * @RequirePermission still requires a valid authenticated session — see
 * dashboards.controller.ts for the same precedent.
 */
@ApiTags('search')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('search')
export class SearchController {
  @Get()
  @ApiOkResponse({ type: SearchResponseDto })
  async search(@Query() query: SearchQueryDto): Promise<SearchResponseDto> {
    const prisma = getPrismaClient();
    const q = query.q;
    const take = query.limit ?? 5;
    const insensitiveContains = { contains: q, mode: 'insensitive' as const };

    const [accounts, contacts, leads, opportunities, carriers, tasks, policies, claims, cases, campaigns, articles] =
      await Promise.all([
        prisma.account.findMany({ where: { name: insensitiveContains }, take, select: { id: true, name: true, status: true } }),
        prisma.contact.findMany({
          where: { OR: [{ firstName: insensitiveContains }, { lastName: insensitiveContains }, { email: insensitiveContains }] },
          take,
          select: { id: true, firstName: true, lastName: true, email: true, accountId: true },
        }),
        prisma.lead.findMany({
          where: { OR: [{ firstName: insensitiveContains }, { lastName: insensitiveContains }, { companyName: insensitiveContains }] },
          take,
          select: { id: true, firstName: true, lastName: true, companyName: true },
        }),
        prisma.opportunity.findMany({
          where: { name: insensitiveContains },
          take,
          select: { id: true, name: true, account: { select: { name: true } } },
        }),
        prisma.carrier.findMany({ where: { name: insensitiveContains }, take, select: { id: true, name: true, carrierType: true } }),
        prisma.task.findMany({ where: { title: insensitiveContains }, take, select: { id: true, title: true, status: true } }),
        prisma.policy.findMany({
          where: { policyNumber: insensitiveContains },
          take,
          select: { id: true, policyNumber: true, account: { select: { name: true } } },
        }),
        prisma.claim.findMany({
          where: { claimNumber: insensitiveContains },
          take,
          select: { id: true, claimNumber: true, status: true },
        }),
        prisma.case.findMany({
          where: { OR: [{ caseNumber: insensitiveContains }, { subject: insensitiveContains }] },
          take,
          select: { id: true, caseNumber: true, subject: true, status: true },
        }),
        prisma.campaign.findMany({ where: { name: insensitiveContains }, take, select: { id: true, name: true, status: true } }),
        prisma.knowledgeArticle.findMany({
          where: { title: insensitiveContains },
          take,
          select: { id: true, title: true, status: true },
        }),
      ]);

    const results: SearchResultDto[] = [
      ...accounts.map((a): SearchResultDto => ({ id: a.id, type: 'ACCOUNT', title: a.name, subtitle: a.status, href: `/accounts/${a.id}` })),
      ...contacts.map(
        (c): SearchResultDto => ({
          id: c.id,
          type: 'CONTACT',
          title: `${c.firstName} ${c.lastName}`,
          subtitle: c.email,
          href: c.accountId ? `/accounts/${c.accountId}` : '/accounts',
        }),
      ),
      ...leads.map((l): SearchResultDto => ({ id: l.id, type: 'LEAD', title: `${l.firstName} ${l.lastName}`, subtitle: l.companyName, href: `/leads/${l.id}` })),
      ...opportunities.map((o): SearchResultDto => ({ id: o.id, type: 'OPPORTUNITY', title: o.name, subtitle: o.account.name, href: `/opportunities/${o.id}` })),
      ...carriers.map((c): SearchResultDto => ({ id: c.id, type: 'CARRIER', title: c.name, subtitle: c.carrierType, href: `/carriers/${c.id}` })),
      ...tasks.map((t): SearchResultDto => ({ id: t.id, type: 'TASK', title: t.title, subtitle: t.status, href: '/tasks' })),
      ...policies.map((p): SearchResultDto => ({ id: p.id, type: 'POLICY', title: p.policyNumber, subtitle: p.account.name, href: `/policies/${p.id}` })),
      ...claims.map((c): SearchResultDto => ({ id: c.id, type: 'CLAIM', title: c.claimNumber, subtitle: c.status, href: `/claims/${c.id}` })),
      ...cases.map((c): SearchResultDto => ({ id: c.id, type: 'CASE', title: c.caseNumber, subtitle: c.subject, href: `/cases/${c.id}` })),
      ...campaigns.map((c): SearchResultDto => ({ id: c.id, type: 'CAMPAIGN', title: c.name, subtitle: c.status, href: `/campaigns/${c.id}` })),
      ...articles.map((a): SearchResultDto => ({ id: a.id, type: 'KNOWLEDGE_ARTICLE', title: a.title, subtitle: a.status, href: `/knowledge/${a.id}` })),
    ];

    return { results };
  }
}
