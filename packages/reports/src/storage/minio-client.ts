import { S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from '@topiadesk/config';

/**
 * Mirrors backend/api/src/modules/documents/minio-client.ts's construction
 * exactly (forcePathStyle + scoped MINIO_APP_ACCESS_KEY/SECRET_KEY — see
 * that file's header comment for why both matter against a self-hosted
 * MinIO endpoint). A separate S3Client instance rather than importing
 * DocumentsModule's singleton because backend/worker has no dependency on
 * backend/api (and vice versa) — this package is the shared layer both
 * apps already depend on for @topiadesk/db/@topiadesk/config, so it's the
 * correct place for the second, identically-configured client rather than
 * either app reaching into the other's module internals. There is no
 * dedicated reports bucket in infra/minio — report exports are stored in
 * MINIO_DOCUMENTS_BUCKET under a `reports/` key prefix (see
 * report-storage.ts) rather than provisioning new infra for this batch.
 */
let client: S3Client | undefined;

export function getReportsMinioClient(): S3Client {
  if (!client) {
    const env = loadEnv();
    client = new S3Client({
      endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.MINIO_APP_ACCESS_KEY,
        secretAccessKey: env.MINIO_APP_SECRET_KEY,
      },
    });
  }
  return client;
}

export function reportsBucket(): string {
  return loadEnv().MINIO_DOCUMENTS_BUCKET;
}

/**
 * A signed URL's query-string signature covers the 'host' header as part
 * of SigV4's canonical request — computed from whatever endpoint the
 * signing S3Client is configured with, independent of network reachability
 * (presigning never opens a connection). documents.service.ts's
 * getDownloadStream() comment explains why documents proxy downloads
 * instead of signing: `MINIO_ENDPOINT` (`minio:9000`) is the Docker-internal
 * hostname and is not resolvable outside the compose network, so a URL
 * signed against it would 404/DNS-fail for an external browser — and
 * naively rewriting the host string on an already-signed URL breaks the
 * signature (the actual Host header sent no longer matches what was
 * signed). This module's brief explicitly asks for a signed URL rather
 * than a proxy, so this client is configured with the host-machine-reachable
 * address (docker-compose.override.yml publishes MinIO's port directly to
 * localhost for local dev) — correct for `docker compose up` on a dev
 * machine; a real deployment would need this to be MinIO's actual public
 * endpoint (e.g. via a dedicated MINIO_PUBLIC_ENDPOINT env var), not
 * hardcoded localhost.
 */
let presigningClient: S3Client | undefined;

export function getReportsPresigningMinioClient(): S3Client {
  if (!presigningClient) {
    const env = loadEnv();
    presigningClient = new S3Client({
      endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://localhost:${env.MINIO_PORT}`,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.MINIO_APP_ACCESS_KEY,
        secretAccessKey: env.MINIO_APP_SECRET_KEY,
      },
    });
  }
  return presigningClient;
}
