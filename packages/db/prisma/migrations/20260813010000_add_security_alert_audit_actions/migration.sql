-- ACCESS_DENIED: PermissionGuard's coarse denial, recorded for the new
-- permission-denied-burst detector. SECURITY_ALERT: the alert itself,
-- raised by detect-anomalies.job.ts.
ALTER TYPE "AuditAction" ADD VALUE 'ACCESS_DENIED';
ALTER TYPE "AuditAction" ADD VALUE 'SECURITY_ALERT';
