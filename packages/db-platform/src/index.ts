// Re-exports getPlatformPrismaClient() plus every generated Prisma type/enum
// for the platform schema (TenantStatus, SubscriptionStatus, ...) — see
// client.ts. RlsContext/runWithRlsContext/getRlsContext/SYSTEM_JOB_CONTEXT
// stay owned by @topiadesk/db — import those from there directly.
export * from './client';
