import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { getMinioClient, documentsBucket } from '../documents/minio-client';
import { sanitizeFileName } from '../documents/documents.service';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Per-tenant login-page logo — same `Tenant.logoStorageKey`-column,
 * write-object-then-point-row-at-it, delete-old-object-after shape as
 * identity/avatar-storage.util.ts's storeAvatarFromBuffer, just against
 * @topiadesk/db-platform's Tenant instead of @topiadesk/db's User (this
 * belongs to the platform schema, not any one tenant's own schema, since
 * the Keycloak login page that displays it has no tenant RLS context yet —
 * see public-tenant-branding.controller.ts). Called from
 * tenant-branding.controller.ts (self-service, gated by the caller's own
 * RlsContext resolving "my tenant").
 */
export async function storeTenantLogoFromBuffer(tenantId: string, buffer: Buffer, contentType: string, originalName = 'logo'): Promise<void> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const platformPrisma = getPlatformPrismaClient();
    const previous = await platformPrisma.tenant.findUnique({ where: { id: tenantId }, select: { logoStorageKey: true } });

    const storageKey = `branding/tenants/${tenantId}/${randomUUID()}-${sanitizeFileName(originalName)}`;
    const bucket = documentsBucket();
    await getMinioClient().send(new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: buffer, ContentType: contentType }));
    await platformPrisma.tenant.update({ where: { id: tenantId }, data: { logoStorageKey: storageKey } });

    if (previous?.logoStorageKey) {
      await getMinioClient()
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: previous.logoStorageKey }))
        .catch(() => undefined);
    }
  });
}

export async function deleteTenantLogo(tenantId: string): Promise<void> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const platformPrisma = getPlatformPrismaClient();
    const existing = await platformPrisma.tenant.findUnique({ where: { id: tenantId }, select: { logoStorageKey: true } });
    if (!existing?.logoStorageKey) return;
    await platformPrisma.tenant.update({ where: { id: tenantId }, data: { logoStorageKey: null } });
    await getMinioClient()
      .send(new DeleteObjectCommand({ Bucket: documentsBucket(), Key: existing.logoStorageKey }))
      .catch(() => undefined);
  });
}

export { MAX_LOGO_BYTES };
