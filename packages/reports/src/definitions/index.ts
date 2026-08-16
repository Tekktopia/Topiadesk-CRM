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
import { caseResolutionTimeByCategoryReport } from './case-resolution-time-by-category';
import { slaComplianceByTeamReport } from './sla-compliance-by-team';
import { agentCaseThroughputReport } from './agent-case-throughput';
import { caseReopenQualityRateReport } from './case-reopen-quality-rate';
import { kycExpiryRiskReport } from './kyc-expiry-risk';
import { teamWorkloadDistributionReport } from './team-workload-distribution';
import { policyLapseRiskPredictionReport } from './policy-lapse-risk-prediction';

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
  caseResolutionTimeByCategoryReport,
  slaComplianceByTeamReport,
  agentCaseThroughputReport,
  caseReopenQualityRateReport,
  kycExpiryRiskReport,
  teamWorkloadDistributionReport,
  policyLapseRiskPredictionReport,
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
  caseResolutionTimeByCategoryReport,
  slaComplianceByTeamReport,
  agentCaseThroughputReport,
  caseReopenQualityRateReport,
  kycExpiryRiskReport,
  teamWorkloadDistributionReport,
  policyLapseRiskPredictionReport,
};
