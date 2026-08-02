/**
 * TopiaDesk CRM — worker process bootstrap.
 *
 * Wires up the two real BullMQ repeatable jobs owned by this module (see
 * src/jobs/): the renewal-alert scan (~every 15 min) and the premium-aging
 * materialized-view refresh (hourly). Kept minimal beyond that
 * registration — this file's job is to prove the container starts
 * cleanly, actually connects to Redis (not a hardcoded "ok"), and exposes
 * a real health endpoint driven by live connection/worker state, so
 * docker-compose healthchecks and Prometheus scraping have something
 * honest to point at.
 */
import { createServer } from 'node:http';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { registerJobs, closeJobs, type RegisteredJobs } from './jobs';

const env = loadEnv();

const redis = new Redis(env.REDIS_URL, {
  // Keep retrying rather than throwing on the first connection attempt —
  // in `docker compose up`, redis and worker can start in either order.
  retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  // Required by BullMQ (this connection is shared with the Queue/Worker
  // instances below, which issue blocking commands) — without it ioredis
  // gives up on blocking calls after its default retry budget, which
  // surfaces as jobs silently never being picked up, not a clear error.
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

let jobs: RegisteredJobs | undefined;

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    // Honest, not hardcoded: reflects ioredis's real connection state AND
    // whether the BullMQ workers are actually running (not just that the
    // Redis socket is up) — a Worker can be constructed successfully but
    // not yet processing (still connecting), or have been closed during
    // shutdown while the HTTP server briefly outlives it.
    const redisReady = redis.status === 'ready';
    const workersRunning = jobs !== undefined && jobs.workers.every((w) => w.isRunning());
    const healthy = redisReady && workersRunning;
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: healthy ? 'ok' : 'degraded',
        redis: redis.status,
        bullmq: jobs === undefined ? 'not_initialized' : workersRunning ? 'running' : 'stopped',
      }),
    );
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(env.WORKER_METRICS_PORT, '0.0.0.0', () => {
  console.log(`[worker] health endpoint listening on :${env.WORKER_METRICS_PORT}/health`);
});

registerJobs(redis)
  .then((registered) => {
    jobs = registered;
    console.log('[worker] renewal-scan and premium-aging-refresh jobs registered.');
  })
  .catch((err) => {
    console.error('[worker] failed to register BullMQ jobs:', err);
    process.exitCode = 1;
  });

function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down...`);
  server.close();
  Promise.resolve(jobs ? closeJobs(jobs) : undefined)
    .catch((err) => console.error('[worker] error closing BullMQ jobs:', err))
    .then(() => redis.quit().catch(() => redis.disconnect()))
    .finally(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
