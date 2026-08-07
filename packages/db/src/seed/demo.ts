import { PrismaClient } from '@prisma/client';
import type { BaselineSeedResult } from './baseline';

const KC = {
  admin: '11111111-1111-1111-1111-111111111111',
  manager: '22222222-2222-2222-2222-222222222222',
  broker: '33333333-3333-3333-3333-333333333333',
  compliance: '44444444-4444-4444-4444-444444444444',
};

/**
 * The fixture/demo half of seeding: 4 named demo users (fixed Keycloak
 * subject IDs matching infra/keycloak/realm-export.json — do not
 * randomize), 2 demo carriers, a mock integration connector, and one full
 * sample account -> contact/lead/opportunity/policy chain. Never called
 * for real tenant provisioning (see packages/db-platform's plan) — only
 * from prisma/seed.ts for local dev / the single-tenant Docker Compose
 * stack. Requires seedBaseline()'s result (roles/departments/branches/
 * industries/pipeline stages) to already exist.
 */
export async function seedDemoData(prisma: PrismaClient, baseline: BaselineSeedResult) {
  console.log('[seed] demo users');
  const { corporateBroking, claimsCompliance } = baseline.departments;
  const { lagosHq } = baseline.branches;

  const adminUser = await prisma.user.upsert({
    where: { keycloakSubjectId: KC.admin },
    update: {},
    create: { keycloakSubjectId: KC.admin, email: 'admin@topiadesk.local', fullName: 'TopiaDesk Admin', departmentId: corporateBroking.id, branchId: lagosHq.id },
  });
  const managerUser = await prisma.user.upsert({
    where: { keycloakSubjectId: KC.manager },
    update: {},
    create: { keycloakSubjectId: KC.manager, email: 'manager@topiadesk.local', fullName: 'Amaka Obi', departmentId: corporateBroking.id, branchId: lagosHq.id },
  });
  const brokerUser = await prisma.user.upsert({
    where: { keycloakSubjectId: KC.broker },
    update: {},
    create: { keycloakSubjectId: KC.broker, email: 'broker@topiadesk.local', fullName: 'Tunde Bakare', departmentId: corporateBroking.id, branchId: lagosHq.id },
  });
  const complianceUser = await prisma.user.upsert({
    where: { keycloakSubjectId: KC.compliance },
    update: {},
    create: { keycloakSubjectId: KC.compliance, email: 'compliance@topiadesk.local', fullName: 'Ngozi Eze', departmentId: claimsCompliance.id, branchId: lagosHq.id },
  });

  for (const [user, role] of [
    [adminUser, baseline.roles.admin],
    [managerUser, baseline.roles.manager],
    [brokerUser, baseline.roles.accountHandler],
    [complianceUser, baseline.roles.compliance],
  ] as const) {
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }

  console.log('[seed] mock integration connector');
  await prisma.integrationConnector.upsert({
    where: { name: 'Core Broking System (Mock)' },
    update: {},
    create: {
      name: 'Core Broking System (Mock)',
      connectorType: 'MOCK_STUB',
      config: { fixtureEndpoint: 'http://mock-core-broking.internal/fixtures/policies.json' },
      isEnabled: true,
      syncDirection: 'INBOUND',
      pollingIntervalMinutes: 60,
    },
  });

  // Carrier/sample-account chain uses plain .create() (Carrier has no
  // natural unique business key, and the demo account/policy/etc. chain
  // only makes sense created together once) — the `migrate` container runs
  // `migrate:deploy && seed` on EVERY `docker compose up`, not just the
  // first, so without this guard a second run either throws (unique
  // constraint on policy_number) or, worse, silently duplicates rows with
  // no unique constraint to catch it (Carrier). Caught during Phase 0
  // docker-compose verification.
  const demoDataAlreadySeeded = (await prisma.account.count()) > 0;
  if (demoDataAlreadySeeded) {
    console.log('[seed] demo carriers/account/policy chain already present — skipping (idempotent re-run).');
    return { adminUser, managerUser, brokerUser, complianceUser };
  }

  console.log('[seed] carriers');
  const aiico = await prisma.carrier.create({ data: { name: 'AIICO Insurance Plc', carrierType: 'INSURER', amBestRating: 'B++', linesOfBusiness: ['Marine', 'Property', 'Engineering'], panelStatus: 'ACTIVE' } });
  await prisma.carrier.create({ data: { name: 'Continental Reinsurance Plc', carrierType: 'REINSURER', amBestRating: 'A-', linesOfBusiness: ['Property', 'Casualty'], panelStatus: 'ACTIVE', treatyType: 'Quota Share' } });

  console.log('[seed] sample account, contact, lead, opportunity, policy');
  const account = await prisma.account.create({
    data: {
      name: 'Delta Oilfield Services Ltd',
      accountType: 'CORPORATE',
      status: 'CLIENT',
      industryId: baseline.industries.oilGas.id,
      riskRating: 'MEDIUM',
      city: 'Port Harcourt',
      state: 'Rivers',
      country: 'NG',
      ownerId: brokerUser.id,
      source: 'Referral',
    },
  });

  await prisma.contact.create({
    data: { accountId: account.id, firstName: 'Chidi', lastName: 'Nwosu', email: 'chidi.nwosu@deltaoilfield.example', title: 'Risk Manager', isPrimary: true },
  });

  await prisma.lead.create({
    data: { source: 'REFERRAL', firstName: 'Funke', lastName: 'Adeyemi', companyName: 'Adeyemi Logistics', status: 'QUALIFIED', assignedToId: brokerUser.id, score: 72 },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      accountId: account.id,
      name: 'Delta Oilfield — Property & Engineering Renewal FY26',
      pipelineStageId: baseline.pipelineStages.newBusiness[2]!.id,
      amount: '45000000.00',
      probability: 60,
      expectedCloseDate: new Date('2026-09-15'),
      ownerId: brokerUser.id,
      lineOfBusiness: 'Property',
    },
  });

  await prisma.opportunityMarketSubmission.create({
    data: { opportunityId: opportunity.id, carrierId: aiico.id, quotedPremium: '4200000.00', status: 'QUOTED' },
  });

  const policy = await prisma.policy.create({
    data: {
      policyNumber: 'TDK-PROP-2026-00042',
      accountId: account.id,
      carrierId: aiico.id,
      lineOfBusiness: 'Property',
      sumInsured: '500000000.00',
      currency: 'NGN',
      inceptionDate: new Date('2025-09-15'),
      expiryDate: new Date('2026-09-15'),
      status: 'ISSUED',
      brokerOfRecordId: brokerUser.id,
    },
  });

  const policyVersion = await prisma.policyVersion.create({
    data: { policyId: policy.id, versionNumber: 1, versionType: 'ISSUANCE', effectiveDate: new Date('2025-09-15'), createdById: brokerUser.id },
  });
  await prisma.policy.update({ where: { id: policy.id }, data: { currentVersionId: policyVersion.id } });

  await prisma.premium.create({
    data: { policyId: policy.id, policyVersionId: policyVersion.id, grossPremium: '4200000.00', netPremium: '3780000.00', commissionRate: '10.00', commissionAmount: '420000.00', dueDate: new Date('2025-09-30'), paidAmount: '4200000.00', paidDate: new Date('2025-09-20'), status: 'PAID' },
  });

  const renewalDue = new Date('2026-09-15');
  const nextAlert = new Date();
  nextAlert.setDate(nextAlert.getDate() + 1);
  await prisma.renewalSchedule.create({
    data: { policyId: policy.id, renewalDueDate: renewalDue, assignedToId: brokerUser.id, nextAlertDueAt: nextAlert, status: 'ON_TRACK' },
  });

  return { adminUser, managerUser, brokerUser, complianceUser };
}
