import type { ReportDefinition } from '@topiadesk/reports';
import { ALL_REPORT_DEFINITIONS } from '@topiadesk/reports';

interface ReportSynonyms {
  reportKey: string;
  names: string[];
  synonyms: string[];
}

/**
 * Curated synonym map for smarter report discovery.
 * Maps common user phrasings to report keys.
 */
const REPORT_SYNONYMS: ReportSynonyms[] = [
  {
    reportKey: 'broker-productivity',
    names: ['Broker Productivity', "how's my book doing", "my book", 'my business'],
    synonyms: ['sales pipeline', 'revenue', 'deals', 'my accounts'],
  },
  {
    reportKey: 'policy-lapse-rate',
    names: ['Policy Lapse Rate'],
    synonyms: ['lapsed policies', 'policy cancellations', 'churn', 'losing policies'],
  },
  {
    reportKey: 'policy-lapse-risk-prediction',
    names: ['Policy Lapse Risk Prediction', 'at-risk policies'],
    synonyms: ['retention', 'renewal risk', 'lapse warning', 'policies to save'],
  },
  {
    reportKey: 'premium-aging-by-branch',
    names: ['Premium Aging by Branch', 'outstanding premiums'],
    synonyms: ['overdue premiums', 'payment collection', 'aging report', 'past due'],
  },
  {
    reportKey: 'renewal-pipeline-by-carrier',
    names: ['Renewal Pipeline by Carrier'],
    synonyms: ['renewals', 'upcoming renewals', 'renewal schedule', 'carrier renewals'],
  },
  {
    reportKey: 'team-workload-distribution',
    names: ['Team Workload Distribution', 'team load'],
    synonyms: ['agent workload', 'case load', 'task load', 'workload balance', 'who is busy'],
  },
  {
    reportKey: 'kyc-expiry-risk',
    names: ['KYC Expiry Risk'],
    synonyms: ['kyc expiring', 'kyc renewal', 'compliance', 'kyc verification', 'identity verification'],
  },
  {
    reportKey: 'agent-case-throughput',
    names: ['Agent Case Throughput'],
    synonyms: ['case closure rate', 'case velocity', 'agent productivity', 'case handling'],
  },
  {
    reportKey: 'sales-pipeline-conversion-velocity',
    names: ['Sales Pipeline Conversion Velocity'],
    synonyms: ['sales velocity', 'pipeline health', 'conversion rate', 'deal velocity', 'sales speed'],
  },
  {
    reportKey: 'case-resolution-time-by-category',
    names: ['Case Resolution Time by Category'],
    synonyms: ['case age', 'resolution speed', 'time to resolve', 'case duration'],
  },
  {
    reportKey: 'sla-compliance-by-team',
    names: ['SLA Compliance by Team'],
    synonyms: ['sla breaches', 'sla performance', 'compliance score', 'meeting slas'],
  },
];

/**
 * Try exact or substring match against report synonyms first,
 * before falling back to embedding-based matching.
 */
export function findReportByExactMatch(query: string): ReportDefinition | null {
  const lowerQuery = query.toLowerCase();

  for (const synonymGroup of REPORT_SYNONYMS) {
    // Check all names and synonyms
    const allPhrasings = [...synonymGroup.names, ...synonymGroup.synonyms];
    for (const phrasing of allPhrasings) {
      if (lowerQuery.includes(phrasing.toLowerCase())) {
        const found = ALL_REPORT_DEFINITIONS.find((d) => d.key === synonymGroup.reportKey);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Analyze a report's results and generate bullet-point insights.
 * Looks for trends, outliers, and actionable patterns.
 */
export function generateReportInsights(
  result: {
    columns: Array<{ key: string; label: string; format: string }>;
    rows: Record<string, unknown>[];
  },
  reportName: string,
): string[] {
  const insights: string[] = [];

  if (result.rows.length === 0) {
    insights.push(`No data found in ${reportName} — consider broadening your filters.`);
    return insights;
  }

  // Find numeric columns for analysis
  const numericColumns = result.columns.filter((c) => c.format === 'number').map((c) => c.key);

  for (const colKey of numericColumns) {
    const values = result.rows
      .map((r) => r[colKey])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (values.length === 0) continue;

    values.sort((a, b) => a - b);
    const min = values[0]!;
    const max = values[values.length - 1]!;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const label = result.columns.find((c) => c.key === colKey)?.label ?? colKey;

    // High variance (outliers present)
    if (max > avg * 2) {
      insights.push(`${label}: Wide variance detected (${min}–${max}). Consider flagging outliers.`);
    }

    // All values clustered low
    if (max < avg * 1.5 && max > 0) {
      insights.push(`${label}: All values are relatively low (max: ${max}). May indicate capacity for growth.`);
    }

    // Many zeros or nulls
    const zeroCount = result.rows.filter((r) => r[colKey] === 0 || r[colKey] === null).length;
    if (zeroCount > result.rows.length * 0.3) {
      insights.push(`${label}: ${Math.round((zeroCount / result.rows.length) * 100)}% of entries are empty/zero.`);
    }
  }

  // Detect trend in time-series-like patterns (if a 'createdAt' or date column exists)
  const dateColumn = result.columns.find((c) => c.format === 'date');
  if (dateColumn) {
    const dateValues = result.rows
      .map((r) => ({ date: new Date(r[dateColumn.key] as string), row: r }))
      .filter(
        (item): item is { date: Date; row: Record<string, unknown> } =>
          !isNaN(item.date.getTime()),
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (dateValues.length > 2) {
      const oldest = dateValues[0]!.date;
      const newest = dateValues[dateValues.length - 1]!.date;
      const daySpan = (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24);
      if (daySpan > 0) {
        insights.push(`Data spans ${Math.round(daySpan)} days (${oldest.toLocaleDateString()} to ${newest.toLocaleDateString()}).`);
      }
    }
  }

  // Row count insight
  if (result.rows.length > 100) {
    insights.push(`Large dataset: ${result.rows.length} rows. Consider applying filters for focused analysis.`);
  } else if (result.rows.length < 5) {
    insights.push(`Small dataset: only ${result.rows.length} rows. Results may not be statistically significant.`);
  }

  return insights.slice(0, 4); // Limit to 4 insights for brevity
}

/**
 * Recommend related reports based on the user's question.
 * Returns top 2-3 related reports with brief explanation.
 */
export function recommendReports(userQuery: string, currentReportKey?: string): Array<{ name: string; reason: string }> {
  const recommendations: Array<{ name: string; reason: string }> = [];
  const lowerQuery = userQuery.toLowerCase();

  // Map of keywords to related reports
  const relatedMap: Record<string, string[]> = {
    'retention|lapse|renewal': ['policy-lapse-risk-prediction', 'policy-lapse-rate', 'premium-aging-by-branch'],
    'workload|team|agent|busy': ['team-workload-distribution', 'agent-case-throughput', 'sla-compliance-by-team'],
    'kyc|compliance|identity|verification': ['kyc-expiry-risk', 'document-compliance-readiness'],
    'sales|pipeline|deals|opportunity': ['sales-pipeline-conversion-velocity', 'broker-productivity'],
    'case|ticket|customer|support': ['case-resolution-time-by-category', 'sla-compliance-by-team', 'agent-case-throughput'],
    'commission|revenue|premium|earning': ['commission-revenue', 'broker-productivity', 'premium-aging-by-branch'],
  };

  for (const [keywords, reportKeys] of Object.entries(relatedMap)) {
    const keywordPatterns = keywords.split('|');
    if (keywordPatterns.some((kw) => lowerQuery.includes(kw))) {
      for (const key of reportKeys) {
        if (key !== currentReportKey) {
          const report = ALL_REPORT_DEFINITIONS.find((d) => d.key === key);
          if (report && !recommendations.some((r) => r.name === report.name)) {
            recommendations.push({
              name: report.name,
              reason: `Related to your question about ${keywords.split('|')[0]}`,
            });
          }
        }
      }
    }
  }

  return recommendations.slice(0, 2); // Top 2 recommendations
}
