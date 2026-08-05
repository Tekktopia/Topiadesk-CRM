/**
 * Re-exports the actual report-definition types/registry from
 * @topiadesk/reports (packages/reports/src/report-definition.ts).
 *
 * Why the real implementation lives in a shared package instead of here
 * directly: backend/worker's scheduled-report dispatch (see
 * backend/worker/src/jobs/scheduled-reports/generate-and-deliver.job.ts)
 * has to execute the exact same report definitions this registry holds —
 * "runs the report via the registry" only works if both processes see one
 * shared set of ReportDefinition objects, not two independently-maintained
 * copies that can drift. backend/api and backend/worker have no dependency
 * on each other (by design — see backend/worker/package.json), but both
 * already depend on @topiadesk/db and @topiadesk/config from packages/*,
 * so packages/reports follows that exact same established pattern for the
 * registry, the 12 report definitions, and the xlsx/csv/pdf export +
 * MinIO-upload code the API's export endpoint and the worker's delivery
 * job both need. This file exists so the path named in this module's brief
 * is a real, working import, not just documentation.
 */
export * from '@topiadesk/reports';
