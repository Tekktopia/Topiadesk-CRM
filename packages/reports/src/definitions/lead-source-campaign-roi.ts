import { z } from 'zod';
import { LeadSource, type PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    source: z.nativeEnum(LeadSource).optional(),
    createdFrom: z.string().date().optional(),
    createdTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'source', label: 'Lead Source' },
  { key: 'sourceCampaign', label: 'Source Campaign' },
  { key: 'matchedCampaign', label: 'Matched Campaign' },
];

const measures: ReportMeasure[] = [
  { key: 'leadCount', label: 'Leads', aggregate: 'count', format: 'number' },
  { key: 'convertedCount', label: 'Converted', aggregate: 'count', format: 'number' },
  { key: 'conversionRatePercent', label: 'Conversion Rate', aggregate: 'avg', format: 'percent' },
  { key: 'avgTimeToConversionDays', label: 'Avg Time to Conversion (days)', aggregate: 'avg', format: 'days' },
];

/**
 * Lead has no dedicated `convertedAt` timestamp — `updatedAt` at the point
 * status flips to CONVERTED is the best available proxy for time-to-
 * conversion (documented approximation, same reasoning as
 * broker-productivity's Opportunity->Bound days). The Campaign join is
 * genuinely best-effort per the brief: `sourceCampaign` is a free-text
 * field on Lead with no FK to Campaign, so this only ever matches by exact
 * case-insensitive name and silently leaves matchedCampaign null rather
 * than failing when the campaigns module/table isn't populated yet.
 */
export const leadSourceCampaignRoiReport: ReportDefinition<Filters> = {
  key: 'lead-source-campaign-roi',
  name: 'Lead Source & Campaign ROI',
  description: 'Lead volume and conversion rate by source and source campaign, with time-to-conversion and best-effort Campaign attribution.',
  category: 'MARKETING',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'bar',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : undefined;
    const createdTo = filters.createdTo ? new Date(filters.createdTo) : undefined;

    const leads = await prisma.lead.findMany({
      where: {
        source: filters.source,
        createdAt: createdFrom || createdTo ? { gte: createdFrom, lte: createdTo } : undefined,
      },
    });

    const campaignNameByLowercase = new Map<string, string>();
    try {
      const campaigns = await prisma.campaign.findMany({ select: { name: true } });
      for (const c of campaigns) campaignNameByLowercase.set(c.name.toLowerCase(), c.name);
    } catch {
      // Campaigns module/table not populated yet — best-effort join degrades to "no match", not a failure.
    }

    const rawRows: Array<Record<string, ReportCellValue>> = leads.map((lead) => {
      const converted = lead.status === 'CONVERTED';
      const timeToConversionDays = converted ? Math.max(0, Math.round((lead.updatedAt.getTime() - lead.createdAt.getTime()) / 86_400_000)) : 0;
      const matchedCampaign = lead.sourceCampaign ? (campaignNameByLowercase.get(lead.sourceCampaign.toLowerCase()) ?? null) : null;
      return {
        source: lead.source,
        sourceCampaign: lead.sourceCampaign ?? '(none)',
        matchedCampaign: matchedCampaign ?? '(unmatched)',
        leadCount: 1,
        convertedCount: converted ? 1 : 0,
        conversionRatePercent: converted ? 100 : 0,
        avgTimeToConversionDays: timeToConversionDays,
        avgTimeToConversionDaysWeight: converted ? 1 : 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension, { avgTimeToConversionDays: 'avgTimeToConversionDaysWeight' });
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
