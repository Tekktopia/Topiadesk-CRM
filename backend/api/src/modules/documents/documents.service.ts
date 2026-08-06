import { randomUUID, createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getPrismaClient, type Document, type DocumentEntityType, type DocumentVersion } from '@topiadesk/db';
import { getMinioClient, documentsBucket } from './minio-client';

/**
 * The one legitimately polymorphic table (DocumentLink) has no DB FK to
 * enforce entityId validity — schema comment: "integrity enforced at the
 * service layer against a small fixed entityType->repository map". These
 * models all live in the shared, frozen schema.prisma regardless of which
 * agent implements their own controller, so querying them directly here is
 * safe and doesn't couple this module to crm/policy's controller code.
 * A lookup miss is also what happens if the row exists but is outside the
 * caller's RLS-visible scope — indistinguishable from "doesn't exist",
 * which is the correct fail-closed behavior for a link target check.
 */
const ENTITY_EXISTS_CHECK: Record<DocumentEntityType, (id: string) => Promise<boolean>> = {
  ACCOUNT: async (id) => (await getPrismaClient().account.findUnique({ where: { id }, select: { id: true } })) !== null,
  CONTACT: async (id) => (await getPrismaClient().contact.findUnique({ where: { id }, select: { id: true } })) !== null,
  POLICY: async (id) => (await getPrismaClient().policy.findUnique({ where: { id }, select: { id: true } })) !== null,
  OPPORTUNITY: async (id) => (await getPrismaClient().opportunity.findUnique({ where: { id }, select: { id: true } })) !== null,
  LEAD: async (id) => (await getPrismaClient().lead.findUnique({ where: { id }, select: { id: true } })) !== null,
  TASK: async (id) => (await getPrismaClient().task.findUnique({ where: { id }, select: { id: true } })) !== null,
  CLAIM: async (id) => (await getPrismaClient().claim.findUnique({ where: { id }, select: { id: true } })) !== null,
  CASE: async (id) => (await getPrismaClient().case.findUnique({ where: { id }, select: { id: true } })) !== null,
};

export interface DocumentWithCurrentVersion extends Document {
  currentVersion: DocumentVersion | null;
}

@Injectable()
export class DocumentsService {
  async upload(
    file: Express.Multer.File,
    categoryId: string | undefined,
    uploadedById: string,
  ): Promise<DocumentWithCurrentVersion> {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded (expected multipart field "file")');

    const documentId = randomUUID();
    const versionId = randomUUID();
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `documents/${documentId}/v1-${versionId}-${sanitizeFileName(file.originalname)}`;
    const bucket = documentsBucket();

    // Upload to object storage BEFORE writing any DB rows: if MinIO write
    // fails, nothing references it (safe no-op); if it succeeds but the DB
    // write below fails, we're left with an orphaned object, not a DB row
    // pointing at storage that doesn't exist — the safer failure mode.
    await getMinioClient().send(
      new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: file.buffer, ContentType: file.mimetype }),
    );

    const prisma = getPrismaClient();
    await prisma.document.create({
      data: {
        id: documentId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        categoryId: categoryId ?? null,
        uploadedById,
      },
    });
    const version = await prisma.documentVersion.create({
      data: {
        id: versionId,
        documentId,
        versionNumber: 1,
        storageKey,
        storageBucket: bucket,
        sizeBytes: BigInt(file.size),
        checksumSha256,
        uploadedById,
      },
    });
    const document = await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: versionId } });

    return { ...document, currentVersion: version };
  }

  async addVersion(
    documentId: string,
    file: Express.Multer.File,
    changeNote: string | undefined,
    uploadedById: string,
  ): Promise<DocumentWithCurrentVersion> {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded (expected multipart field "file")');
    const prisma = getPrismaClient();
    const existing = await prisma.document.findUnique({ where: { id: documentId } });
    if (!existing) throw new NotFoundException(`Document ${documentId} not found`);

    const versionCount = await prisma.documentVersion.count({ where: { documentId } });
    const versionId = randomUUID();
    const versionNumber = versionCount + 1;
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `documents/${documentId}/v${versionNumber}-${versionId}-${sanitizeFileName(file.originalname)}`;
    const bucket = documentsBucket();

    await getMinioClient().send(
      new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: file.buffer, ContentType: file.mimetype }),
    );

    const version = await prisma.documentVersion.create({
      data: {
        id: versionId,
        documentId,
        versionNumber,
        storageKey,
        storageBucket: bucket,
        sizeBytes: BigInt(file.size),
        checksumSha256,
        uploadedById,
        changeNote: changeNote ?? null,
      },
    });
    // Keep the top-level fileName/mimeType/sizeBytes in sync with the
    // now-current version — those columns denormalize the "latest" state
    // so list views don't need to join DocumentVersion for common fields.
    const document = await prisma.document.update({
      where: { id: documentId },
      data: {
        currentVersionId: versionId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
      },
    });

    return { ...document, currentVersion: version };
  }

  async findOne(documentId: string): Promise<DocumentWithCurrentVersion> {
    const document = await getPrismaClient().document.findUnique({
      where: { id: documentId },
      include: { currentVersion: true },
    });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    return document;
  }

  async list(categoryId?: string, search?: string): Promise<DocumentWithCurrentVersion[]> {
    return getPrismaClient().document.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { fileName: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { currentVersion: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Streams the object body straight from MinIO rather than returning a
   * presigned URL. Trade-off considered and rejected: MinIO in this stack
   * is reachable only on the internal Docker network (`minio:9000`), not
   * fronted by Traefik — a presigned URL built from that hostname would be
   * unresolvable by an external browser client. Proxying also keeps every
   * download on the same auth/audit path as the rest of the API (the
   * caller already passed PermissionGuard + RLS to get here) instead of
   * handing out a bearer-token-free URL that's valid for anyone who has
   * it. Revisit if MinIO ever gets a public-facing endpoint — a presigned
   * GET would then offload bandwidth from the API process.
   */
  async getDownloadStream(
    documentId: string,
    versionId?: string,
  ): Promise<{ stream: Readable; document: Document; version: DocumentVersion }> {
    const prisma = getPrismaClient();
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);

    const version = versionId
      ? await prisma.documentVersion.findUnique({ where: { id: versionId } })
      : document.currentVersionId
        ? await prisma.documentVersion.findUnique({ where: { id: document.currentVersionId } })
        : null;
    if (!version || version.documentId !== documentId) {
      throw new NotFoundException(`No downloadable version found for document ${documentId}`);
    }

    const result = await getMinioClient().send(new GetObjectCommand({ Bucket: version.storageBucket, Key: version.storageKey }));
    if (!result.Body) throw new NotFoundException(`Object ${version.storageKey} missing from storage`);
    return { stream: result.Body as Readable, document, version };
  }

  async createLink(documentId: string, entityType: DocumentEntityType, entityId: string, linkedById: string) {
    const document = await getPrismaClient().document.findUnique({ where: { id: documentId }, select: { id: true } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);

    const exists = await ENTITY_EXISTS_CHECK[entityType](entityId);
    if (!exists) {
      throw new BadRequestException(`No ${entityType.toLowerCase()} found with id ${entityId} (or it is outside your visibility scope)`);
    }

    return getPrismaClient().documentLink.create({ data: { documentId, entityType, entityId, linkedById } });
  }

  async listLinks(documentId: string) {
    return getPrismaClient().documentLink.findMany({ where: { documentId }, orderBy: { linkedAt: 'desc' } });
  }

  async deleteLink(linkId: string): Promise<void> {
    try {
      await getPrismaClient().documentLink.delete({ where: { id: linkId } });
    } catch {
      // RLS hides rows outside scope the same way a genuinely-missing row
      // does — Prisma's delete throws P2025 either way; both map to 404.
      throw new NotFoundException(`Document link ${linkId} not found`);
    }
  }

  /**
   * Read-only listing — no auto-archival/deletion (RetentionPolicy schema
   * comment: archive/flag-for-review only, until legal confirms retention
   * periods). Small in-memory filter, not a SQL date-interval query — fine
   * at Phase-1 document volumes; revisit if the documents table grows
   * large enough for this join to matter.
   */
  async listDueForReview() {
    const prisma = getPrismaClient();
    const [policies, documents] = await Promise.all([
      prisma.retentionPolicy.findMany(),
      prisma.document.findMany({ where: { isArchived: false }, include: { category: true, retentionPolicy: true } }),
    ]);
    const policyByCategoryId = new Map(policies.filter((p) => p.categoryId).map((p) => [p.categoryId as string, p]));

    const now = Date.now();
    const due: Array<{
      documentId: string;
      fileName: string;
      categoryName: string | null;
      retentionYears: number;
      actionOnExpiry: string;
      documentCreatedAt: Date;
      retentionDueAt: Date;
    }> = [];

    for (const doc of documents) {
      const policy = doc.retentionPolicy ?? (doc.categoryId ? policyByCategoryId.get(doc.categoryId) : undefined);
      if (!policy) continue;
      const retentionDueAt = new Date(doc.createdAt);
      retentionDueAt.setFullYear(retentionDueAt.getFullYear() + policy.retentionYears);
      if (retentionDueAt.getTime() <= now) {
        due.push({
          documentId: doc.id,
          fileName: doc.fileName,
          categoryName: doc.category?.name ?? null,
          retentionYears: policy.retentionYears,
          actionOnExpiry: policy.actionOnExpiry,
          documentCreatedAt: doc.createdAt,
          retentionDueAt,
        });
      }
    }
    return due;
  }
}

// Exported for reuse by any other module that writes S3 keys off a
// user-supplied filename (e.g. identity.controller.ts's avatar upload) —
// strips path separators and anything not safe in an S3 key. The original
// name is still preserved verbatim on the Document row for display; this
// only affects the storage key.
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180);
}
