import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getReportsMinioClient, getReportsPresigningMinioClient, reportsBucket } from './minio-client';
import { EXPORT_CONTENT_TYPE, type ReportExportFormat } from '../export';

export interface UploadedReportFile {
  bucket: string;
  key: string;
}

export async function uploadReportFile(
  runId: string,
  reportKey: string,
  format: ReportExportFormat,
  buffer: Buffer,
): Promise<UploadedReportFile> {
  const bucket = reportsBucket();
  const key = `reports/${runId}/${reportKey}-${randomUUID()}.${format}`;
  await getReportsMinioClient().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: EXPORT_CONTENT_TYPE[format] }),
  );
  return { bucket, key };
}

/**
 * Signed GET URL rather than proxying the download through the API, unlike
 * documents.service.ts's getDownloadStream() — see minio-client.ts's
 * getReportsPresigningMinioClient() comment for why this uses a SEPARATE
 * client (signed against the host-machine-reachable address, not the
 * Docker-internal one) rather than the upload client above: a SigV4
 * signature covers the 'host' header, so signing with the internal
 * endpoint and rewriting the URL's host afterwards would invalidate the
 * signature — this signs with the externally-reachable host from the
 * start instead.
 */
export async function getReportDownloadUrl(bucket: string, key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getReportsPresigningMinioClient(), command, { expiresIn: expiresInSeconds });
}
