import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getPrismaClient } from '@topiadesk/db';
import { getMinioClient, documentsBucket } from '../documents/minio-client';
import { sanitizeFileName } from '../documents/documents.service';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Shared by IdentityController.uploadMyAvatar (self-service, raw bytes off
 * a multipart upload) and ScimController's create/replace/patch User
 * handlers (provisioning-source photo URL, see storeAvatarFromUrl below) —
 * one place owns "write these bytes to MinIO under avatars/{userId}/... and
 * point the user row at it, deleting whatever was there before." Same
 * PutObject-before-DB-write ordering, and best-effort old-object cleanup
 * after, as DocumentsService.upload.
 */
export async function storeAvatarFromBuffer(userId: string, buffer: Buffer, contentType: string, originalName = 'avatar'): Promise<void> {
  const prisma = getPrismaClient();
  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarStorageKey: true } });

  const storageKey = `avatars/${userId}/${randomUUID()}-${sanitizeFileName(originalName)}`;
  const bucket = documentsBucket();
  await getMinioClient().send(new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: buffer, ContentType: contentType }));
  await prisma.user.update({ where: { id: userId }, data: { avatarStorageKey: storageKey } });

  if (previous?.avatarStorageKey) {
    await getMinioClient()
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: previous.avatarStorageKey }))
      .catch(() => undefined);
  }
}

/**
 * Fetches a provisioning-source photo URL (SCIM's `photos[].value` — a
 * reference URL, never embedded bytes per RFC 7643 §4.1.2) and stores it
 * via storeAvatarFromBuffer. Deliberately throws on any failure (bad URL,
 * non-image response, oversized body, timeout) rather than silently
 * no-op'ing — callers (ScimController) must catch this themselves and log
 * it, since a broken/unreachable photo URL must never fail the surrounding
 * user provisioning request (creating/updating the account itself always
 * matters more than the picture).
 */
export async function storeAvatarFromUrl(userId: string, url: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Photo URL fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) throw new Error(`Photo URL did not return an image (content-type: ${contentType || 'none'})`);

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_AVATAR_BYTES) throw new Error(`Photo exceeds ${MAX_AVATAR_BYTES} byte limit`);

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_AVATAR_BYTES) throw new Error(`Photo exceeds ${MAX_AVATAR_BYTES} byte limit`);

  await storeAvatarFromBuffer(userId, Buffer.from(arrayBuffer), contentType, url.split('/').pop() ?? 'avatar');
}
