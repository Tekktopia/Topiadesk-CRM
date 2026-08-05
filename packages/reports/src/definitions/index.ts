import type { ReportDefinition } from '../report-definition';
import { premiumAgingByBranchReport } from './premium-aging-by-branch';
import { renewalPipelineByCarrierReport } from './renewal-pipeline-by-carrier';
import { brokerProductivityReport } from './broker-productivity';
import { policyLapseRateReport } from './policy-lapse-rate';
import { salesPipelineConversionVelocityReport } from './sales-pipeline-conversion-velocity';
import { marketSubmissionPerformanceReport } from './market-submission-performance';
import { commissionRevenueReport } from './commission-revenue';
import { accountPortfolioConcentrationReport } from './account-portfolio-concentration';
import { leadSourceCampaignRoiReport } from './lead-source-campaign-roi';
import { documentComplianceReadinessReport } from './document-compliance-readiness';
import { claimsTurnaroundTimeReport } from './claims-turnaround-time';
import { complaintCaseVolumeTrendsReport } from './complaint-case-volume-trends';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_REPORT_DEFINITIONS: ReportDefinition<any>[] = [
  premiumAgingByBranchReport,
  renewalPipelineByCarrierReport,
  brokerProductivityReport,
  policyLapseRateReport,
  salesPipelineConversionVelocityReport,
  marketSubmissionPerformanceReport,
  commissionRevenueReport,
  accountPortfolioConcentrationReport,
  leadSourceCampaignRoiReport,
  documentComplianceReadinessReport,
  claimsTurnaroundTimeReport,
  complaintCaseVolumeTrendsReport,
];

export {
  premiumAgingByBranchReport,
  renewalPipelineByCarrierReport,
  brokerProductivityReport,
  policyLapseRateReport,
  salesPipelineConversionVelocityReport,
  marketSubmissionPerformanceReport,
  commissionRevenueReport,
  accountPortfolioConcentrationReport,
  leadSourceCampaignRoiReport,
  documentComplianceReadinessReport,
  claimsTurnaroundTimeReport,
  complaintCaseVolumeTrendsReport,
};
