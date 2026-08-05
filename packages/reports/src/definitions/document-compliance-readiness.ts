import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    carrierId: z.string().uuid().optional(),
    lineOfBusiness: z.string().min(1).optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'branch', label: 'Branch' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'lineOfBusiness', label: 'Line of Business' },
];

const measures: ReportMeasure[] = [
  { key: 'policyCount', label: 'Bound Policies', aggregate: 'count', format: 'number' },
  { key: 'fullyCompliantCount', label: 'Fully Compliant', aggregate: 'count', format: 'number' },
  { key: 'compliancePercent', label: 'Compliance Rate', aggregate: 'avg', format: 'percent' },
  { key: 'missingDocAgingDays', label: 'Avg Age of Missing-Doc Policies (days)', aggregate: 'avg', format: 'days' },
];

const BOUND_POLICY_STATUSES = ['BOUND', 'ISSUED', 'ENDORSED', 'RENEWED'] as const;

/**
 * "Required doc categories for a bound policy" has no config table in the
 * schema (RetentionPolicy governs disposal, not completeness) — this fixes
 * a small, server-defined required set (the two categories seed.ts already
 * creates for exactly this purpose: POLICY_DOC and KYC_AML), same spirit as
 * every other report's fixed-registry constraint: the set is hard-coded
 * here, never client-supplied.
 */
const REQUIRED_DOCUMENT_CATEGORY_CODES = ['POLICY_DOC', 'KYC_AML'] as const;

export const documentComplianceReadinessReport: ReportDefinition<Filters> = {
  key: 'document-compliance-readiness',
  name: 'Document Compliance Readiness',
  description: 'Share of bound policies with all required document categories linked, and how long non-compliant policies have been outstanding.',
  category: 'COMPLIANCE',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'gauge',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const policies = await prisma.policy.findMany({
      where: {
        status: { in: [...BOUND_POLICY_STATUSES] },
        carrierId: filters.carrierId,
        lineOfBusiness: filters.lineOfBusiness,
      },
      include: { carrier: true, brokerOfRecord: { include: { branch: true } } },
    });
    if (policies.length === 0) {
      return buildReportResult(reportColumns(dimensions, measures, dimension), []);
    }

    // DocumentLink is deliberately polymorphic (entityType/entityId, no FK)
    // — see documents.service.ts's ENTITY_EXISTS_CHECK comment — so this is
    // a plain findMany filter, not a Prisma relation include.
    const links = await prisma.documentLink.findMany({
      where: { entityType: 'POLICY', entityId: { in: policies.map((p) => p.id) } },
      include: { document: { include: { category: true } } },
    });
    const linkedCategoryCodesByPolicyId = new Map<string, Set<string>>();
    for (const link of links) {
      const code = link.document.category?.code;
      if (!code) continue;
      const set = linkedCategoryCodesByPolicyId.get(link.entityId) ?? new Set<string>();
      set.add(code);
      linkedCategoryCodesByPolicyId.set(link.entityId, set);
    }

    const now = Date.now();
    const rawRows: Array<Record<string, ReportCellValue>> = policies.map((policy) => {
      const linkedCodes = linkedCategoryCodesByPolicyId.get(policy.id) ?? new Set<string>();
      const missingCount = REQUIRED_DOCUMENT_CATEGORY_CODES.filter((code) => !linkedCodes.has(code)).length;
      const fullyCompliant = missingCount === 0;
      return {
        branch: policy.brokerOfRecord?.branch?.name ?? 'Unassigned',
        carrier: policy.carrier.name,
        lineOfBusiness: policy.lineOfBusiness,
        policyCount: 1,
        fullyCompliantCount: fullyCompliant ? 1 : 0,
        compliancePercent: fullyCompliant ? 100 : 0,
        missingDocAgingDays: fullyCompliant ? 0 : Math.max(0, Math.round((now - policy.inceptionDate.getTime()) / 86_400_000)),
        missingDocAgingDaysWeight: fullyCompliant ? 0 : 1,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension, { missingDocAgingDays: 'missingDocAgingDaysWeight' });
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
