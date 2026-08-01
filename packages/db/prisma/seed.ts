/**
 * Seed script — runs as app_migrator (schema owner) via DIRECT_URL,
 * deliberately bypassing the RLS-wrapped client: seeding is a trusted,
 * migration-adjacent bootstrap step, not request-serving application code.
 *
 * Keycloak subject IDs below are fixed/deterministic so they match the
 * realm-export fixtures under infra/keycloak/ — do not randomize them.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

const KC = {
  admin: '11111111-1111-1111-1111-111111111111',
  manager: '22222222-2222-2222-2222-222222222222',
  broker: '33333333-3333-3333-3333-333333333333',
  compliance: '44444444-4444-4444-4444-444444444444',
};

async function main() {
  console.log('[seed] departments & branches');
  const [corporateBroking, retailBroking, claimsCompliance, finance] = await Promise.all([
    prisma.department.upsert({ where: { code: 'CORP-BROK' }, update: {}, create: { code: 'CORP-BROK', name: 'Corporate Broking' } }),
    prisma.department.upsert({ where: { code: 'RETAIL-BROK' }, update: {}, create: { code: 'RETAIL-BROK', name: 'Retail Broking' } }),
    prisma.department.upsert({ where: { code: 'CLAIMS-COMP' }, update: {}, create: { code: 'CLAIMS-COMP', name: 'Claims & Compliance' } }),
    prisma.department.upsert({ where: { code: 'FINANCE' }, update: {}, create: { code: 'FINANCE', name: 'Finance' } }),
  ]);

  const [lagosHq, abuja, portHarcourt] = await Promise.all([
    prisma.branch.upsert({ where: { code: 'LAG-HQ' }, update: {}, create: { code: 'LAG-HQ', name: 'Lagos HQ', city: 'Lagos', state: 'Lagos', country: 'NG' } }),
    prisma.branch.upsert({ where: { code: 'ABV' }, update: {}, create: { code: 'ABV', name: 'Abuja Branch', city: 'Abuja', state: 'FCT', country: 'NG' } }),
    prisma.branch.upsert({ where: { code: 'PHC' }, update: {}, create: { code: 'PHC', name: 'Port Harcourt Branch', city: 'Port Harcourt', state: 'Rivers', country: 'NG' } }),
  ]);

  console.log('[seed] roles & permissions');
  const resources = ['account', 'lead', 'opportunity', 'task', 'activity', 'policy', 'renewal_schedule', 'document', 'approval', 'ai_usage', 'audit_log', 'integration'] as const;
  const actions = ['read', 'write'] as const;
  const scopes = ['OWN', 'DEPARTMENT', 'BRANCH', 'ALL'] as const;

  const permissionByKey = new Map<string, { id: string }>();
  for (const resource of resources) {
    for (const action of actions) {
      for (const scope of scopes) {
        const perm = await prisma.permission.upsert({
          where: { resource_action_scope: { resource, action, scope } },
          update: {},
          create: { resource, action, scope },
        });
        permissionByKey.set(`${resource}:${action}:${scope}`, perm);
      }
    }
  }

  async function grantRole(name: string, description: string, isSystemRole: boolean, grants: Array<[string, string, (typeof scopes)[number]]>) {
    const role = await prisma.role.upsert({ where: { name }, update: { description }, create: { name, description, isSystemRole } });
    for (const [resource, action, scope] of grants) {
      const perm = permissionByKey.get(`${resource}:${action}:${scope}`);
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
    return role;
  }

  const adminRole = await grantRole('ADMIN', 'Full system access', true, resources.flatMap((r) => actions.map((a) => [r, a, 'ALL'] as [string, string, (typeof scopes)[number]])));
  const managerRole = await grantRole(
    'MANAGER',
    'Department head — sees and manages all records owned within their department',
    true,
    ['account', 'lead', 'opportunity', 'task', 'activity', 'policy', 'renewal_schedule', 'document'].flatMap((r) => actions.map((a) => [r, a, 'DEPARTMENT'] as [string, string, (typeof scopes)[number]])),
  );
  const accountHandlerRole = await grantRole(
    'ACCOUNT_HANDLER',
    'Front-line broker — manages their own book of business',
    true,
    ['account', 'lead', 'opportunity', 'task', 'activity', 'policy', 'renewal_schedule', 'document'].flatMap((r) => actions.map((a) => [r, a, 'OWN'] as [string, string, (typeof scopes)[number]])),
  );
  const complianceRole = await grantRole('COMPLIANCE_OFFICER', 'Audit, approvals, and regulatory oversight', true, [
    ['account', 'read', 'ALL'], ['policy', 'read', 'ALL'], ['approval', 'read', 'ALL'], ['approval', 'write', 'ALL'],
    ['audit_log', 'read', 'ALL'], ['ai_usage', 'read', 'ALL'], ['document', 'read', 'ALL'],
  ]);

  console.log('[seed] demo users');
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
    [adminUser, adminRole],
    [managerUser, managerRole],
    [brokerUser, accountHandlerRole],
    [complianceUser, complianceRole],
  ] as const) {
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }

  console.log('[seed] industries, document categories, retention policies');
  const oilGas = await prisma.industry.upsert({ where: { name: 'Oil & Gas' }, update: {}, create: { name: 'Oil & Gas' } });
  await prisma.industry.upsert({ where: { name: 'Manufacturing' }, update: {}, create: { name: 'Manufacturing' } });
  await prisma.industry.upsert({ where: { name: 'Financial Services' }, update: {}, create: { name: 'Financial Services' } });
  await prisma.industry.upsert({ where: { name: 'Real Estate' }, update: {}, create: { name: 'Real Estate' } });
  await prisma.industry.upsert({ where: { name: 'Aviation' }, update: {}, create: { name: 'Aviation' } });

  const policyDocCategory = await prisma.documentCategory.upsert({ where: { code: 'POLICY_DOC' }, update: {}, create: { code: 'POLICY_DOC', name: 'Policy Document' } });
  await prisma.documentCategory.upsert({ where: { code: 'KYC_AML' }, update: {}, create: { code: 'KYC_AML', name: 'KYC / AML Document' } });
  await prisma.documentCategory.upsert({ where: { code: 'CORRESPONDENCE' }, update: {}, create: { code: 'CORRESPONDENCE', name: 'Correspondence' } });
  await prisma.documentCategory.upsert({ where: { code: 'GENERAL' }, update: {}, create: { code: 'GENERAL', name: 'General' } });

  // Everything below this point uses plain .create() (Pipeline/Carrier have
  // no natural unique business key to upsert against, and the demo
  // account/policy/etc. chain only makes sense created together once) — the
  // `migrate` container runs `migrate:deploy && seed` on EVERY `docker
  // compose up`, not just the first, so without this guard a second run
  // either throws (unique constraint on policy_number) or, worse, silently
  // duplicates rows with no unique constraint to catch it (Pipeline,
  // Carrier). Caught during Phase 0 docker-compose verification. Reference/
  // RBAC data above this line (departments, roles, users, industries,
  // document categories) stays on upsert and is safe to always re-run.
  const demoDataAlreadySeeded = (await prisma.account.count()) > 0;
  if (demoDataAlreadySeeded) {
    console.log('[seed] demo/reference operational data already present — skipping (idempotent re-run).');
  } else {
    await seedDemoOperationalData(policyDocCategory.id, oilGas.id, brokerUser.id);
  }

  console.log('[seed] org settings & mock integration connector');
  await prisma.orgSetting.upsert({
    where: { key: 'renewal.default_alert_thresholds_days' },
    update: {},
    create: { key: 'renewal.default_alert_thresholds_days', value: [90, 60, 30, 7], updatedById: adminUser.id },
  });
  await prisma.orgSetting.upsert({
    where: { key: 'security.mfa_required_roles' },
    update: {},
    create: { key: 'security.mfa_required_roles', value: ['ADMIN', 'COMPLIANCE_OFFICER'], updatedById: adminUser.id },
  });

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

  console.log('[seed] done.');
}

async function seedDemoOperationalData(policyDocCategoryId: string, oilGasIndustryId: string, brokerUserId: string) {
  await prisma.retentionPolicy.create({ data: { categoryId: policyDocCategoryId, retentionYears: 7, actionOnExpiry: 'FLAG_FOR_REVIEW' } });

  console.log('[seed] pipelines & stages');
  const newBusinessPipeline = await prisma.pipeline.create({ data: { name: 'New Business', lineOfBusiness: null } });
  const renewalPipeline = await prisma.pipeline.create({ data: { name: 'Renewals', lineOfBusiness: null } });
  const nbStages = await Promise.all(
    [
      ['Prospecting', 0, 10],
      ['Needs Analysis', 1, 25],
      ['Quotation', 2, 50],
      ['Negotiation', 3, 75],
      ['Closed Won', 4, 100],
      ['Closed Lost', 5, 0],
    ].map(([name, order, prob]) =>
      prisma.pipelineStage.create({
        data: {
          pipelineId: newBusinessPipeline.id,
          name: name as string,
          order: order as number,
          defaultProbability: prob as number,
          isWon: name === 'Closed Won',
          isLost: name === 'Closed Lost',
        },
      }),
    ),
  );
  await Promise.all(
    [
      ['Renewal Due', 0, 20],
      ['Terms Negotiation', 1, 60],
      ['Renewed', 2, 100],
      ['Lapsed', 3, 0],
    ].map(([name, order, prob]) =>
      prisma.pipelineStage.create({
        data: { pipelineId: renewalPipeline.id, name: name as string, order: order as number, defaultProbability: prob as number, isWon: name === 'Renewed', isLost: name === 'Lapsed' },
      }),
    ),
  );

  console.log('[seed] carriers');
  const aiico = await prisma.carrier.create({ data: { name: 'AIICO Insurance Plc', carrierType: 'INSURER', amBestRating: 'B++', linesOfBusiness: ['Marine', 'Property', 'Engineering'], panelStatus: 'ACTIVE' } });
  await prisma.carrier.create({ data: { name: 'Continental Reinsurance Plc', carrierType: 'REINSURER', amBestRating: 'A-', linesOfBusiness: ['Property', 'Casualty'], panelStatus: 'ACTIVE', treatyType: 'Quota Share' } });

  console.log('[seed] sample account, contact, lead, opportunity, policy');
  const account = await prisma.account.create({
    data: {
      name: 'Delta Oilfield Services Ltd',
      accountType: 'CORPORATE',
      status: 'CLIENT',
      industryId: oilGasIndustryId,
      riskRating: 'MEDIUM',
      city: 'Port Harcourt',
      state: 'Rivers',
      country: 'NG',
      ownerId: brokerUserId,
      source: 'Referral',
    },
  });

  await prisma.contact.create({
    data: { accountId: account.id, firstName: 'Chidi', lastName: 'Nwosu', email: 'chidi.nwosu@deltaoilfield.example', title: 'Risk Manager', isPrimary: true },
  });

  await prisma.lead.create({
    data: { source: 'REFERRAL', firstName: 'Funke', lastName: 'Adeyemi', companyName: 'Adeyemi Logistics', status: 'QUALIFIED', assignedToId: brokerUserId, score: 72 },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      accountId: account.id,
      name: 'Delta Oilfield — Property & Engineering Renewal FY26',
      pipelineStageId: nbStages[2]!.id,
      amount: '45000000.00',
      probability: 60,
      expectedCloseDate: new Date('2026-09-15'),
      ownerId: brokerUserId,
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
      brokerOfRecordId: brokerUserId,
    },
  });

  const policyVersion = await prisma.policyVersion.create({
    data: { policyId: policy.id, versionNumber: 1, versionType: 'ISSUANCE', effectiveDate: new Date('2025-09-15'), createdById: brokerUserId },
  });
  await prisma.policy.update({ where: { id: policy.id }, data: { currentVersionId: policyVersion.id } });

  await prisma.premium.create({
    data: { policyId: policy.id, policyVersionId: policyVersion.id, grossPremium: '4200000.00', netPremium: '3780000.00', commissionRate: '10.00', commissionAmount: '420000.00', dueDate: new Date('2025-09-30'), paidAmount: '4200000.00', paidDate: new Date('2025-09-20'), status: 'PAID' },
  });

  const renewalDue = new Date('2026-09-15');
  const nextAlert = new Date();
  nextAlert.setDate(nextAlert.getDate() + 1);
  await prisma.renewalSchedule.create({
    data: { policyId: policy.id, renewalDueDate: renewalDue, assignedToId: brokerUserId, nextAlertDueAt: nextAlert, status: 'ON_TRACK' },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
