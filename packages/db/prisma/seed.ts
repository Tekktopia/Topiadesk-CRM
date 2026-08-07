/**
 * Seed script — runs as app_migrator (schema owner) via DIRECT_URL,
 * deliberately bypassing the RLS-wrapped client: seeding is a trusted,
 * migration-adjacent bootstrap step, not request-serving application code.
 *
 * Thin entrypoint only — the actual seed logic lives in src/seed/baseline.ts
 * (org structure: departments/branches/roles/permissions/pipelines/
 * industries/document categories/retention policies/org settings/default
 * dashboards) and src/seed/demo.ts (fixture data: demo users/carriers/
 * sample account chain), split so tenant provisioning
 * (backend/worker/src/jobs/platform/provision-tenant.job.ts) can call
 * seedBaseline() alone against a fresh tenant schema without pulling in
 * this project's own demo fixtures.
 */
import { PrismaClient } from '@prisma/client';
import { seedBaseline } from '../src/seed/baseline';
import { seedDemoData } from '../src/seed/demo';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

async function main() {
  const baseline = await seedBaseline(prisma);
  await seedDemoData(prisma, baseline);
  console.log('[seed] done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
