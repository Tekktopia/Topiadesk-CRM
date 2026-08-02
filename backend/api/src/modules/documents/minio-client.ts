import { S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from '@topiadesk/config';

/**
 * MinIO is S3-API-compatible, so the standard `@aws-sdk/client-s3` client
 * works against it unmodified — with two settings that are easy to get
 * subtly wrong pointed at a self-hosted endpoint instead of AWS:
 *
 * 1. `forcePathStyle: true` — MinIO (and most self-hosted S3-compatible
 *    stores) only supports path-style addressing (http://host:port/bucket/key).
 *    The AWS SDK v3 defaults to virtual-hosted-style (http://bucket.host:port/key),
 *    which resolves to a DNS name that doesn't exist for a bare `minio:9000`
 *    endpoint — requests fail with a confusing DNS/connection error, not a
 *    clear "wrong addressing mode" one.
 * 2. `endpoint` is the literal `MINIO_ENDPOINT:MINIO_PORT` from env (the
 *    Docker service name on the internal network, e.g. `minio:9000`), not
 *    an AWS region endpoint. `region` is still required by the SDK's
 *    request-signing code even though MinIO ignores it — any non-empty
 *    string works.
 *
 * Credentials are the scoped `MINIO_APP_ACCESS_KEY`/`MINIO_APP_SECRET_KEY`
 * IAM user created by infra/minio/init/create-buckets.sh — never the MinIO
 * root user.
 */
let client: S3Client | undefined;

export function getMinioClient(): S3Client {
  if (!client) {
    const env = loadEnv();
    client = new S3Client({
      endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
      region: 'us-east-1', // ignored by MinIO but required by the SDK's SigV4 signer
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.MINIO_APP_ACCESS_KEY,
        secretAccessKey: env.MINIO_APP_SECRET_KEY,
      },
    });
  }
  return client;
}

export function documentsBucket(): string {
  return loadEnv().MINIO_DOCUMENTS_BUCKET;
}
