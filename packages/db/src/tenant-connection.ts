/**
 * Shared by client.ts's schema-keyed PrismaClient cache and (indirectly,
 * via that cache) every tenant-scoped runtime query, plus
 * backend/worker/src/jobs/platform/provision-tenant.job.ts's one-off
 * provisioning client. One definition of "what's a valid tenant schema
 * name" and "how do you point a Postgres connection string at one".
 */
export const TENANT_SCHEMA_NAME_PATTERN = /^tenant_[a-z0-9_]+$/;

export function tenantSchemaUrl(baseUrl: string, schemaName: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schemaName);
  return url.toString();
}
