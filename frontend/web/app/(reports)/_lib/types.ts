/**
 * Hand-written types mirroring backend/api/src/modules/reports/dto/*.ts,
 * not derived from `@topiadesk/shared-types`'s `ApiPaths` (unlike
 * app/(policy)/lib/types.ts's convention) — the generated OpenAPI schema
 * (packages/shared-types/src/api-client/schema.d.ts) is a manual snapshot
 * (`pnpm generate:api-client` against a running API, see that package's
 * README comment) that hasn't been regenerated for this Phase 2 batch yet,
 * and regenerating it mid-batch would touch a package shared by 5 other
 * parallel agents. Follows app/(dashboard)/types.ts's precedent instead:
 * hand-written response shapes kept next to the feature that owns them.
 * Same for the ScheduledReport* enums below — hand-mirrored from
 * packages/db/prisma/schema.prisma's Reporting section, the same
 * convention packages/shared-types/src/enums.ts uses, but kept local
 * rather than added to that shared file for the same reason.
 */

export type ReportCategory = 'FINANCE' | 'SALES' | 'RENEWALS' | 'CLAIMS' | 'COMPLIANCE' | 'PRODUCTIVITY' | 'MARKETING';
export type ReportChartType = 'bar' | 'stackedBar' | 'line' | 'funnel' | 'table' | 'treemap' | 'gauge';
export type ReportValueFormat = 'currency' | 'number' | 'percent' | 'days' | 'text' | 'date';
export type ReportMeasureAggregate = 'sum' | 'count' | 'avg';

export interface ReportDimension {
  key: string;
  label: string;
}

export interface ReportMeasure {
  key: string;
  label: string;
  aggregate: ReportMeasureAggregate;
  format: ReportValueFormat;
}

/**
 * A subset of JSON Schema (draft-07) — exactly what zod-to-json-schema
 * produces for the plain `.strict()` object schemas every report's
 * `filterSchema` uses (see reports.controller.ts's `toReportCatalogEntryDto`).
 * Only the keywords those schemas actually emit are modeled; this is
 * intentionally not a general JSON Schema type.
 */
export interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean';
  format?: string;
  enum?: string[];
  minLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}

export interface JsonSchemaObject {
  type?: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ReportCatalogEntry {
  key: string;
  name: string;
  description: string;
  category: ReportCategory;
  filterSchema: JsonSchemaObject;
  allowedDimensions: ReportDimension[];
  measures: ReportMeasure[];
  defaultChartType: ReportChartType;
}

export type ReportCellValue = string | number | boolean | null;

export interface ReportColumn {
  key: string;
  label: string;
  format: ReportValueFormat;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCellValue>>;
  /** Row count before pagination — see ReportsController.paginate(). */
  totalRowCount: number;
  generatedAt: string;
}

export type ReportExportFormat = 'xlsx' | 'csv' | 'pdf';

export interface ReportDownloadResponse {
  downloadUrl: string;
  rowCount: number;
  expiresInSeconds: number;
}

// ---------------------------------------------------------------------------
// Scheduled reports — mirrors packages/db/prisma/schema.prisma's
// ScheduledReportFrequency/Format/DeliveryChannel/RunStatus enums.
// ---------------------------------------------------------------------------

export const SCHEDULED_REPORT_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'] as const;
export type ScheduledReportFrequency = (typeof SCHEDULED_REPORT_FREQUENCIES)[number];

export const SCHEDULED_REPORT_FORMATS = ['PDF', 'EXCEL', 'CSV'] as const;
export type ScheduledReportFormat = (typeof SCHEDULED_REPORT_FORMATS)[number];

export const SCHEDULED_REPORT_DELIVERY_CHANNELS = ['EMAIL', 'IN_APP', 'WEBHOOK'] as const;
export type ScheduledReportDeliveryChannel = (typeof SCHEDULED_REPORT_DELIVERY_CHANNELS)[number];

export interface ScheduledReportRecipientInput {
  userId?: string;
  channel: ScheduledReportDeliveryChannel;
  webhookUrl?: string;
}

export interface ScheduledReportRecipient {
  id: string;
  userId: string | null;
  channel: string;
  webhookUrl: string | null;
}

export interface CreateScheduledReportInput {
  name: string;
  reportKey: string;
  filters: Record<string, unknown>;
  dimension?: string;
  format: ScheduledReportFormat;
  frequency: ScheduledReportFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourOfDayUtc?: number;
  recipients: ScheduledReportRecipientInput[];
}

export type UpdateScheduledReportInput = Partial<CreateScheduledReportInput> & { isActive?: boolean };

export interface ScheduledReport {
  id: string;
  name: string;
  reportKey: string;
  filters: Record<string, unknown>;
  dimension: string | null;
  format: string;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourOfDayUtc: number;
  isActive: boolean;
  ownerId: string;
  nextRunAt: string;
  lastRunAt: string | null;
  recipients: ScheduledReportRecipient[];
  createdAt: string;
}

export interface ScheduledReportRun {
  id: string;
  scheduledReportId: string | null;
  reportKey: string;
  format: string;
  status: string;
  rowCount: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** id -> name/email directory entry, for the recipients picker — same
 * shape as app/(policy)/lib/types.ts's UserOption, backed by the already-
 * existing app/api/identity-users route (not owned by this batch, reused
 * as-is per the build brief's "reading another module's API is fine"). */
export interface UserOption {
  id: string;
  fullName: string;
  email: string;
}
