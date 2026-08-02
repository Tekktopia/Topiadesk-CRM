import type Redis from 'ioredis';
import type { Queue, Worker } from 'bullmq';
import { createRenewalScanQueue, createRenewalScanWorker, scheduleRenewalScan } from './renewal-alerts/renewal-scan.job';
import { createPremiumAgingRefreshQueue, createPremiumAgingRefreshWorker, schedulePremiumAgingRefresh } from './premium-aging/refresh-aging.job';

export interface RegisteredJobs {
  queues: Queue[];
  workers: Worker[];
}

/** Wires up both repeatable jobs and starts their processors — called once from main.ts at boot. */
export async function registerJobs(connection: Redis): Promise<RegisteredJobs> {
  const renewalScanQueue = createRenewalScanQueue(connection);
  const renewalScanWorker = createRenewalScanWorker(connection);
  await scheduleRenewalScan(renewalScanQueue);

  const premiumAgingQueue = createPremiumAgingRefreshQueue(connection);
  const premiumAgingWorker = createPremiumAgingRefreshWorker(connection);
  await schedulePremiumAgingRefresh(premiumAgingQueue);

  return {
    queues: [renewalScanQueue, premiumAgingQueue],
    workers: [renewalScanWorker, premiumAgingWorker],
  };
}

export async function closeJobs(jobs: RegisteredJobs): Promise<void> {
  await Promise.all([...jobs.workers.map((w) => w.close()), ...jobs.queues.map((q) => q.close())]);
}
