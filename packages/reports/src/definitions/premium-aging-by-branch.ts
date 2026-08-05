import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';
import { queryRawWithRlsContext } from '../query-raw-with-rls.util';

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
  { key: 'agingBucket', label: 'Aging Bucket' },
];

const measures: ReportMeasure[] = [
  { key: 'outstandingAmount', label: 'Outstanding Amount', aggregate: 'sum', format: 'currency' },
  { key: 'premiumCount', label: 'Premium Count', aggregate: 'count', format: 'number' },
];

interface Row {
  branch: string;
  carrier: string;
  lineOfBusiness: string;
  agingBucket: string;
  outstandingAmount: number;
  premiumCount: number;
}

/**
 * `premium_aging_summary_scoped` (prisma/rls/004_reporting_views.sql) has no
 * branch/carrier/lineOfBusiness columns of its own — it's deliberately kept
 * at premium grain and joined back to policies/accounts only for the RLS
 * inheritance those tables provide. This report does the same join one
 * level further (policies -> carriers, policies -> users -> branches) to
 * get the grouping columns the brief asks for. Too many joins for Prisma's
 * typed `groupBy` (which only groups on the immediate model's own scalar
 * columns), so this is the one report in this registry that genuinely
 * needs $queryRaw — a parameterized tagged template via
 * queryRawWithRlsContext, never string concatenation.
 */
export const premiumAgingByBranchReport: ReportDefinition<Filters> = {
  key: 'premium-aging-by-branch',
  name: 'Premium Aging by Branch',
  description: 'Outstanding premium balances aged into 1-30/31-60/61-90/90+ day buckets, sliceable by branch, carrier, and line of business.',
  category: 'FINANCE',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'stackedBar',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const carrierId = filters.carrierId ?? null;
    const lineOfBusiness = filters.lineOfBusiness ?? null;

    const rawRows = await queryRawWithRlsContext(prisma, (tx) =>
      tx.$queryRaw<Row[]>`
        SELECT
          COALESCE(b.name, 'Unassigned') AS branch,
          c.name AS carrier,
          p.line_of_business AS "lineOfBusiness",
          pas.aging_bucket AS "agingBucket",
          SUM(pas.outstanding_amount)::float8 AS "outstandingAmount",
          COUNT(*)::int AS "premiumCount"
        FROM premium_aging_summary_scoped pas
        JOIN policies p ON p.id = pas.policy_id
        JOIN carriers c ON c.id = p.carrier_id
        LEFT JOIN users u ON u.id = p.broker_of_record_id
        LEFT JOIN branches b ON b.id = u.branch_id
        WHERE (${carrierId}::uuid IS NULL OR p.carrier_id = ${carrierId}::uuid)
          AND (${lineOfBusiness}::text IS NULL OR p.line_of_business = ${lineOfBusiness}::text)
        GROUP BY branch, c.name, p.line_of_business, pas.aging_bucket
        ORDER BY "outstandingAmount" DESC
      `,
    );

    const rows = reportRows(rawRows as unknown as Array<Record<string, ReportCellValue>>, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
