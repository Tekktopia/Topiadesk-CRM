/**
 * Seed script — runs as app_migrator via PLATFORM_DIRECT_URL, bypassing the
 * RLS-wrapped client, same "trusted migration-adjacent bootstrap step" as
 * packages/db/prisma/seed.ts.
 *
 * The platform-admin Keycloak subject ID below is fixed/deterministic so it
 * matches infra/keycloak/platform-realm-export.json's fixture — do not
 * randomize it.
 */
// NOT '@prisma/client' — see schema.prisma's generator block for why this
// schema generates to a package-local path.
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.PLATFORM_DIRECT_URL } },
});

const PLATFORM_ADMIN_KEYCLOAK_SUBJECT_ID = '99999999-9999-9999-9999-999999999999';

async function main() {
  console.log('[seed:platform] plans');
  await Promise.all([
    prisma.plan.upsert({
      where: { name: 'Starter' },
      update: {},
      create: { name: 'Starter', seatLimit: 10, description: 'Small brokerage teams getting started.' },
    }),
    prisma.plan.upsert({
      where: { name: 'Professional' },
      update: {},
      create: { name: 'Professional', seatLimit: 50, description: 'Growing brokerages with multiple branches.' },
    }),
    prisma.plan.upsert({
      where: { name: 'Enterprise' },
      update: {},
      create: { name: 'Enterprise', seatLimit: 500, description: 'Large brokerages with custom needs.' },
    }),
  ]);

  console.log('[seed:platform] first platform admin');
  await prisma.platformAdminUser.upsert({
    where: { keycloakSubjectId: PLATFORM_ADMIN_KEYCLOAK_SUBJECT_ID },
    update: {},
    create: {
      keycloakSubjectId: PLATFORM_ADMIN_KEYCLOAK_SUBJECT_ID,
      email: 'platform-admin@topiadesk.local',
      fullName: 'TopiaDesk Platform Admin',
      status: 'ACTIVE',
    },
  });

  console.log('[seed:platform] done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
