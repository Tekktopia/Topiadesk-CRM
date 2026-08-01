/**
 * TopiaDesk CRM — worker process bootstrap.
 *
 * Deliberately minimal for this phase: no BullMQ processors are wired up
 * yet (renewal-alert scans, notification dispatch, etc. land in a later
 * batch — see the build plan's "Agent C" / "Agent D" scope). This file's
 * only job is to prove the container starts cleanly, actually connects to
 * Redis (not a hardcoded "ok"), and exposes a real health endpoint driven
 * by that connection's live status — so docker-compose healthchecks and
 * Prometheus scraping have something honest to point at from day one.
 *
 * Do not add fake/simulated job processing here; wire real BullMQ workers
 * in apps/worker/src/jobs/ when that work starts, and this file becomes
 * the place that registers them.
 */
import { createServer } from 'node:http';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

const env = loadEnv();

const redis = new Redis(env.REDIS_URL, {
  // Keep retrying rather than throwing on the first connection attempt —
  // in `docker compose up`, redis and worker can start in either order.
  retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  maxRetriesPerRequest: null,
});

redis.on('ready', () => {
  console.log('[worker] connected to Redis — worker started.');
});
redis.on('error', (err) => {
  console.error('[worker] Redis connection error:', err.message);
});
redis.on('reconnecting', () => {
  console.warn('[worker] Redis connection lost — reconnecting...');
});

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    // Honest, not hardcoded: reflects ioredis's real connection state
    // rather than always returning 200.
    const redisReady = redis.status === 'ready';
    res.writeHead(redisReady ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: redisReady ? 'ok' : 'degraded', redis: redis.status }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(env.WORKER_METRICS_PORT, '0.0.0.0', () => {
  console.log(`[worker] health endpoint listening on :${env.WORKER_METRICS_PORT}/health`);
});

function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down...`);
  server.close();
  redis
    .quit()
    .catch(() => redis.disconnect())
    .finally(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
