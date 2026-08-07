import { Prisma, PrismaClient } from '@prisma/client';

/**
 * The org-structure half of seeding: departments/branches, roles &
 * permissions, pipelines & stages, industries/document categories/
 * retention policies, org settings, and role-flavored default dashboards.
 * No demo/fixture rows (users, sample account, carriers) — see
 * ./demo.ts's seedDemoData() for that half.
 *
 * Deliberately takes a bare `PrismaClient` rather than importing
 * getPrismaClient() itself: this same tenant-schema table structure gets
 * deployed once per customer org (see packages/db-platform's Tenant model
 * and the provisioning job that will call this against a
 * `?schema=tenant_<slug>`-scoped client), so the caller decides which
 * connection/schema this runs against — this function has no opinion.
 *
 * `adminUserId` is optional and, when omitted, org settings/default
 * dashboards are created unattributed (`updatedById`/`ownerId` left null —
 * both columns are nullable for exactly this reason). Real tenant
 * provisioning calls this BEFORE the tenant's first admin User row exists
 * (see the provisioning job's step order), so there is no id to attribute
 * to yet; the local dev seed (prisma/seed.ts) also omits it for
 * consistency with that real flow, rather than special-casing dev to look
 * different from production provisioning.
 */
export async function seedBaseline(prisma: PrismaClient, opts: { adminUserId?: string } = {}) {
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
  // 'identity' covers Batch 1 Agent A's whole domain (users/roles/
  // permissions/departments/branches/teams/org-settings/ip-whitelist) as ONE
  // resource, matching how 'document' already covers Document/
  // DocumentVersion/DocumentLink — not one resource per table.
  //
  // Phase 2 Case Management adds 'claim'/'case'/'sla_config'/'macro' —
  // required for prisma/rls/002_policies.sql's claims_rw/cases_rw/
  // sla_policies_rw/etc WITH CHECK clauses, all of which gate writes on
  // app_max_scope('<resource>', 'write') resolving a real permission grant
  // (ADMIN/SYSTEM_JOB bypass this via app_max_scope's role-name shortcut —
  // every OTHER role, including ACCOUNT_HANDLER/broker used for this
  // module's empirical verification, needs an actual Permission row here or
  // every claim/case/macro/SLA-config write 403s or RLS-denies regardless
  // of what PermissionGuard decides). 'sla_config' covers SlaPolicy/
  // SlaTarget/BusinessHoursCalendar/BusinessHoliday/AssignmentRule/
  // AgentSkill as ONE resource — same "one resource per module's config
  // tier" convention 'identity' set. case_categories/loss_cause_categories/
  // catastrophe_events have no RLS at all (open lookup tables, like
  // carriers) and reuse the 'case'/'claim' resources for their NestJS-layer
  // write gate rather than getting dedicated resources of their own —
  // mirrors how carriers.controller.ts reuses 'account'.
  //
  // Phase 2 Knowledge Base / Surveys adds 'knowledge_category'/
  // 'knowledge_article'/'survey'/'survey_response' — same reasoning as the
  // Case Management block above: RLS's `knowledge_categories_write`/
  // `knowledge_articles_write`/`surveys_rw`/`survey_responses_rw` all gate
  // on app_max_scope('<resource>', ...) resolving a real Permission row,
  // so ACCOUNT_HANDLER/broker and COMPLIANCE_OFFICER/compliance need
  // explicit grants below or the empirical verification for this module
  // 403s or RLS-denies regardless of what the endpoint code does.
  // 'report' gates the /reports/* registry-driven endpoints (catalog/run/
  // export) and the role-flavored /dashboards/executive|branch-manager|
  // broker|compliance render endpoints — read-only by nature (reports are
  // computed on the fly, never stored rows), so only the 'read' action is
  // ever checked, but both are seeded below for symmetry with every other
  // resource. 'scheduled_report' is the separate resource
  // prisma/rls/002_policies.sql's scheduled_reports_rw/scheduled_report_*
  // policies already gate on via app_max_scope('scheduled_report', ...) —
  // without a real Permission row here, every non-ADMIN role's
  // ScheduledReport CRUD/run-now 403s at PermissionGuard before RLS is
  // ever reached, same reasoning as 'claim'/'case' etc. above.
  const resources = [
    'account', 'lead', 'opportunity', 'task', 'activity', 'policy', 'renewal_schedule', 'document', 'approval', 'ai_usage', 'audit_log', 'integration', 'identity',
    'claim', 'case', 'sla_config', 'macro',
    'knowledge_category', 'knowledge_article', 'survey', 'survey_response',
    'report', 'scheduled_report',
    // Phase 2 Campaigns — gates campaigns_rw/campaign_templates_rw/
    // campaign_variants_rw/audience_segments_rw's WITH CHECK, all of which
    // (like survey/survey_response above) have NO OWN/DEPARTMENT/BRANCH
    // tier in RLS, only ALL — bulk send is a higher-privilege action than
    // per-broker CRUD. AudienceSegment is the one exception: its own
    // owner_id column lets any authenticated user own/edit their OWN
    // segment regardless of this grant (see audience_segments_rw), so no
    // OWN-scope grant is needed for that specific case.
    'campaign',
    // Phase 2 Customer Loyalty — gates loyalty_accounts_rw/
    // loyalty_transactions_rw's WITH CHECK (both join through the enrolled
    // Account, same OWN/DEPARTMENT/BRANCH/ALL tiering as 'account' itself).
    'loyalty',
    // Carriers/enterprise pass — carriers.controller.ts used to reuse
    // 'account' write for lack of its own resource (see that controller's
    // header comment, now stale). carriers has no RLS (open supply-side
    // reference data, like case_categories above), so scope tier here is
    // only meaningful to PermissionGuard's coarse "does a grant exist at
    // all" check, not row-level filtering.
    'carrier',
  ] as const;
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

  async function grantRole(
    name: string,
    description: string,
    isSystemRole: boolean,
    grants: Array<[string, string, (typeof scopes)[number]]>,
    // Enterprise pass — dual-control default for granting ADMIN/
    // COMPLIANCE_OFFICER themselves (see Role.requiredApprovalsToGrant's
    // doc comment). Every other role keeps the default of 1 (immediate
    // grant, today's behavior) by simply not passing this.
    requiredApprovalsToGrant = 1,
  ) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description, requiredApprovalsToGrant },
      create: { name, description, isSystemRole, requiredApprovalsToGrant },
    });
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

  const adminRole = await grantRole(
    'ADMIN',
    'Full system access',
    true,
    resources.flatMap((r) => actions.map((a) => [r, a, 'ALL'] as [string, string, (typeof scopes)[number]])),
    2,
  );
  const managerRole = await grantRole(
    'MANAGER',
    'Department head — sees and manages all records owned within their department',
    true,
    [
      ...['account', 'lead', 'opportunity', 'task', 'activity', 'policy', 'renewal_schedule', 'document', 'claim', 'case', 'macro', 'loyalty'].flatMap((r) => actions.map((a) => [r, a, 'DEPARTMENT'] as [string, string, (typeof scopes)[number]])),
      // AI copilot (summarize/reply-draft) is a front-line productivity tool,
      // not an admin-only feature — see backend/api/src/modules/ai-gateway/.
      ['ai_usage', 'write', 'DEPARTMENT'],
      // A branch/department manager runs and schedules reports (the
      // Branch Manager Dashboard's whole reason to exist) — PermissionGuard
      // only checks resource+action existence for ANY scope, so DEPARTMENT
      // here is just what satisfies that coarse gate; actual row-level
      // scoping happens inside each report's execute() via the caller's
      // bound RLS context, not via this scope value.
      ['report', 'read', 'DEPARTMENT'], ['scheduled_report', 'read', 'DEPARTMENT'], ['scheduled_report', 'write', 'DEPARTMENT'],
      // Read-only visibility into SLA policies/business hours/assignment
      // rules/agent skills — a department head should be able to see the
      // routing/SLA config their team operates under, same read-only tier
      // COMPLIANCE_OFFICER already has below. Write stays admin-only
      // ('sla_config' has no write grant here) — this is visibility, not
      // an editing right.
      ['sla_config', 'read', 'ALL'],
      // Campaign send is a department-head-level action in a brokerage
      // (marketing/comms sits with management, not individual brokers) —
      // ALL scope here isn't a scoping leak: campaigns_rw itself has no
      // narrower tier to grant (see the 'campaign' resource comment above).
      ['campaign', 'read', 'ALL'], ['campaign', 'write', 'ALL'],
      // Carrier panel management (onboarding a new market, updating panel
      // status/commission terms) is a department-head-level action, same
      // tier as this role's other supply-side-adjacent grants.
      ['carrier', 'write', 'DEPARTMENT'],
      // Baseline self-service (identity-enterprise pass) — PATCH
      // /identity/me, presence, and avatar (identity.controller.ts) write
      // the caller's OWN users row with no @RequirePermission of their
      // own; the only thing standing between that and a hard failure is
      // users_rw's WITH CHECK (app_can_access_owner('identity', 'write',
      // id)), which needs an actual grant to resolve true even for
      // `id = self`. (Read needs no matching grant — users_rw's USING
      // clause is unconditionally open to any authenticated user, see that
      // policy's own comment for why — so there is no 'identity':'read':
      // 'OWN' grant here; adding one would also satisfy
      // UsersController.list()/get()'s @RequirePermission('identity',
      // 'read') and hand this role the full admin user-directory endpoint,
      // which is not the intent.)
      ['identity', 'write', 'OWN'],
      // Department-head user management — the actual point of B1's
      // delegated-admin scoping: a MANAGER can now deactivate/suspend/
      // reassign/role-change users in their own department without the
      // ADMIN-only ALL tier. 'read' here only satisfies
      // UsersController.list()/get()'s coarse @RequirePermission gate (any
      // scope passes it, same as every other DEPARTMENT-tier grant in this
      // file) — the actual result set from those endpoints is org-wide
      // (see users_rw's comment), not narrowed to this department; only
      // the WRITE tier is truly scope-enforced.
      ['identity', 'read', 'DEPARTMENT'], ['identity', 'write', 'DEPARTMENT'],
    ],
  );
  const accountHandlerRole = await grantRole(
    'ACCOUNT_HANDLER',
    'Front-line broker — manages their own book of business',
    true,
    [
      // claim/case: OWN scope satisfies claims_rw/cases_rw's WITH CHECK
      // (`app_max_scope(...) IS NOT NULL`, any scope), and covers the
      // actual READ path too since this seed's demo Policy/Account are
      // owned by this same broker (app_can_access_owner resolves true via
      // OWN). macro: any staff member can author/apply their own macros —
      // macros_rw's WITH CHECK already self-scopes on created_by_id, OWN
      // here is just what lets PermissionGuard's coarse per-endpoint check
      // pass at all.
      ...['account', 'lead', 'opportunity', 'task', 'activity', 'policy', 'renewal_schedule', 'document', 'claim', 'case', 'macro', 'loyalty'].flatMap((r) => actions.map((a) => [r, a, 'OWN'] as [string, string, (typeof scopes)[number]])),
      ['ai_usage', 'write', 'OWN'],
      // knowledge_category/knowledge_article: OWN scope satisfies
      // `knowledge_categories_write`'s WITH CHECK (any non-null scope) and
      // `knowledge_articles_write`'s (owner_id = self, true for anything
      // this broker authors) — a front-line broker authoring/maintaining
      // their own KB drafts is the normal case; publishing still requires
      // a separate ALL-scope approver (COMPLIANCE_OFFICER below), per the
      // KNOWLEDGE_ARTICLE_PUBLISH maker-checker gate.
      ['knowledge_category', 'write', 'OWN'], ['knowledge_article', 'write', 'OWN'],
      // A broker's own /dashboards/broker view and any scheduled report
      // they own (their book-of-business reports) — same OWN-tier
      // reasoning as the rest of this role's grants.
      ['report', 'read', 'OWN'], ['scheduled_report', 'read', 'OWN'], ['scheduled_report', 'write', 'OWN'],
      // Read-only visibility into SLA policies/business hours/assignment
      // rules/agent skills — a front-line broker should be able to see
      // (not edit) the routing/SLA config that governs how their own
      // claims/cases get routed and timed, matching Freshdesk/Zendesk's
      // UX where any agent can view (if not author) these settings.
      // 'sla_config' has no write grant here — creating/editing this
      // config stays admin-only.
      ['sla_config', 'read', 'ALL'],
      // Baseline self-service (identity-enterprise pass) — see MANAGER's
      // identical write:OWN grant above for the full reasoning. A
      // front-line broker gets ONLY this floor, not DEPARTMENT/BRANCH/ALL
      // — they can edit their own profile but not manage colleagues, and
      // (deliberately no 'identity':'read' grant at any scope) never gain
      // access to the admin user-directory endpoints.
      ['identity', 'write', 'OWN'],
      // Preserves pre-existing behavior: brokers already have 'account':
      // write:OWN, which is what let them create/edit carriers before this
      // resource existed (carriers.controller.ts's stale reuse of
      // 'account'). A front-line broker routinely needs to add a new
      // market they've started placing business with.
      ['carrier', 'write', 'OWN'],
    ],
  );
  const complianceRole = await grantRole('COMPLIANCE_OFFICER', 'Audit, approvals, and regulatory oversight', true, [
    ['account', 'read', 'ALL'], ['policy', 'read', 'ALL'], ['approval', 'read', 'ALL'], ['approval', 'write', 'ALL'],
    // policy:write (ALL) is required to actually apply a decided approval's
    // effect (status/currentVersionId/sumInsured) to the Policy row, not
    // just decide the Approval itself — RLS on `policies` would otherwise
    // block this role from completing the maker-checker flow it exists to
    // run. See backend/api/src/modules/policy/policy-version.controller.ts's
    // /decision endpoint.
    ['policy', 'write', 'ALL'],
    ['audit_log', 'read', 'ALL'], ['ai_usage', 'read', 'ALL'], ['document', 'read', 'ALL'], ['carrier', 'read', 'ALL'],
    // Directory visibility for oversight, satisfying
    // UsersController.list()/get()'s @RequirePermission gate (users_rw's
    // read side is unconditionally open regardless of scope — see that
    // policy's comment — so 'ALL' here is really just this role's
    // documented intent, not a narrower tier being widened). write:OWN is
    // this role's own self-service PATCH /identity/me/presence/avatar
    // floor (see MANAGER's identical grant above for the full reasoning),
    // not a broader user-management write tier — COMPLIANCE_OFFICER is
    // oversight, not delegated admin.
    ['identity', 'read', 'ALL'], ['identity', 'write', 'OWN'],
    // Claims/complaints oversight (this role's users sit in the
    // Claims & Compliance department) — read-only across the whole org,
    // plus write so this role can action a claim/case directly during an
    // investigation, not just view it.
    ['claim', 'read', 'ALL'], ['claim', 'write', 'ALL'], ['case', 'read', 'ALL'], ['case', 'write', 'ALL'],
    // SLA compliance reporting (sla-policies.controller.ts's
    // GET /reports/compliance) is read-only oversight, same tier as
    // audit_log/ai_usage above.
    ['sla_config', 'read', 'ALL'],
    // knowledge_article:write (ALL), not just read — required for the same
    // reason policy:write (ALL) is above: deciding a KNOWLEDGE_ARTICLE_PUBLISH
    // Approval both needs to SEE the IN_REVIEW article
    // (`knowledge_articles_select`'s USING clause requires owner_id=self OR
    // ALL-scope write for non-PUBLISHED rows) and to apply the decision's
    // effect (status -> PUBLISHED/DRAFT) via an UPDATE this role doesn't
    // own. See knowledge-articles.controller.ts's `.../decision` endpoint.
    ['knowledge_article', 'read', 'ALL'], ['knowledge_article', 'write', 'ALL'],
    // Survey definitions and their responses are ALL-scope-only resources
    // (`surveys_rw`/`survey_responses_rw`'s WITH CHECK has no OWN/
    // DEPARTMENT/BRANCH tier) — CSAT/NPS program ownership sits with
    // compliance/QA oversight, not front-line brokers, matching this
    // role's other read-heavy + oversight-write grants.
    ['survey', 'read', 'ALL'], ['survey', 'write', 'ALL'],
    ['survey_response', 'read', 'ALL'], ['survey_response', 'write', 'ALL'],
    // Compliance Dashboard (document-compliance-readiness,
    // complaint-case-volume-trends, claims-turnaround-time) and org-wide
    // scheduled compliance reports — read-only, matching this role's other
    // oversight-tier grants (no scheduled_report:write: compliance views/
    // consumes reports, ownership of a scheduled delivery sits with
    // whichever role actually manages the underlying process).
    ['report', 'read', 'ALL'], ['scheduled_report', 'read', 'ALL'],
    // Read-only oversight of outbound communications (NDPR/consent
    // compliance relevance) — matches this role's other read-heavy
    // oversight grants; sending remains a MANAGER-tier action.
    ['campaign', 'read', 'ALL'],
    // loyalty:write (ALL), not just read — required for the same reason
    // policy:write/knowledge_article:write (ALL) are above: deciding a
    // LOYALTY_REDEMPTION Approval both needs to see the account's ledger
    // and to apply the decision's effect (posting the confirmed REDEEM
    // LoyaltyTransaction) via a write this role doesn't otherwise own.
    ['loyalty', 'read', 'ALL'], ['loyalty', 'write', 'ALL'],
    // Dual-control on granting this role itself — see
    // Role.requiredApprovalsToGrant's doc comment and the trailing `2`
    // argument below.
  ], 2);

  console.log('[seed] pipelines & stages');
  // Pipeline has no natural unique business key (original seed.ts's own
  // comment on this), so — now that this runs unconditionally as part of
  // baseline rather than once behind main()'s old demoDataAlreadySeeded
  // guard — idempotency is a manual findFirst-then-create rather than an
  // upsert.
  const newBusinessPipeline =
    (await prisma.pipeline.findFirst({ where: { name: 'New Business' } })) ??
    (await prisma.pipeline.create({ data: { name: 'New Business', lineOfBusiness: null } }));
  const renewalPipeline =
    (await prisma.pipeline.findFirst({ where: { name: 'Renewals' } })) ??
    (await prisma.pipeline.create({ data: { name: 'Renewals', lineOfBusiness: null } }));
  const nbStages = await Promise.all(
    (
      [
        ['Prospecting', 0, 10],
        ['Needs Analysis', 1, 25],
        ['Quotation', 2, 50],
        ['Negotiation', 3, 75],
        ['Closed Won', 4, 100],
        ['Closed Lost', 5, 0],
      ] as const
    ).map(async ([name, order, prob]) => {
      const existing = await prisma.pipelineStage.findFirst({ where: { pipelineId: newBusinessPipeline.id, name } });
      if (existing) return existing;
      return prisma.pipelineStage.create({
        data: {
          pipelineId: newBusinessPipeline.id,
          name,
          order,
          defaultProbability: prob,
          isWon: name === 'Closed Won',
          isLost: name === 'Closed Lost',
        },
      });
    }),
  );
  const renewalStages = await Promise.all(
    (
      [
        ['Renewal Due', 0, 20],
        ['Terms Negotiation', 1, 60],
        ['Renewed', 2, 100],
        ['Lapsed', 3, 0],
      ] as const
    ).map(async ([name, order, prob]) => {
      const existing = await prisma.pipelineStage.findFirst({ where: { pipelineId: renewalPipeline.id, name } });
      if (existing) return existing;
      return prisma.pipelineStage.create({
        data: { pipelineId: renewalPipeline.id, name, order, defaultProbability: prob, isWon: name === 'Renewed', isLost: name === 'Lapsed' },
      });
    }),
  );

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

  const retentionPolicyExists = await prisma.retentionPolicy.findFirst({ where: { categoryId: policyDocCategory.id } });
  if (!retentionPolicyExists) {
    await prisma.retentionPolicy.create({ data: { categoryId: policyDocCategory.id, retentionYears: 7, actionOnExpiry: 'FLAG_FOR_REVIEW' } });
  }

  console.log('[seed] org settings');
  await prisma.orgSetting.upsert({
    where: { key: 'renewal.default_alert_thresholds_days' },
    update: {},
    create: { key: 'renewal.default_alert_thresholds_days', value: [90, 60, 30, 7], updatedById: opts.adminUserId },
  });
  await prisma.orgSetting.upsert({
    where: { key: 'security.mfa_required_roles' },
    update: {},
    create: { key: 'security.mfa_required_roles', value: ['ADMIN', 'COMPLIANCE_OFFICER'], updatedById: opts.adminUserId },
  });

  console.log('[seed] role-flavored default dashboards');
  await seedDefaultDashboards(prisma, opts.adminUserId);

  return {
    departments: { corporateBroking, retailBroking, claimsCompliance, finance },
    branches: { lagosHq, abuja, portHarcourt },
    roles: { admin: adminRole, manager: managerRole, accountHandler: accountHandlerRole, compliance: complianceRole },
    industries: { oilGas },
    documentCategories: { policyDoc: policyDocCategory },
    pipelines: { newBusiness: newBusinessPipeline, renewal: renewalPipeline },
    pipelineStages: { newBusiness: nbStages, renewal: renewalStages },
  };
}

export type BaselineSeedResult = Awaited<ReturnType<typeof seedBaseline>>;

/**
 * backend/api/src/modules/dashboards/role-dashboards.controller.ts's
 * /dashboards/executive|branch-manager|broker|compliance endpoints resolve
 * a SavedDashboard row by exact `name` + visibility:'ORG' (no unique
 * constraint on `name` to upsert against, hence the explicit
 * findFirst-then-create guard — SavedDashboard.name intentionally isn't
 * unique at the schema level since user-created dashboards may reuse
 * common names). Each widget references a fixed backend/../reports
 * registry key with typed filters — never a raw query — per
 * SavedDashboard's own schema.prisma doc comment. `filters: {}` is valid
 * for every report below since every filterSchema in the registry has all
 * fields optional.
 */
async function seedDefaultDashboards(prisma: PrismaClient, ownerId: string | undefined): Promise<void> {
  const dashboards = [
    {
      name: 'Executive Dashboard',
      widgets: [
        { id: 'commission-revenue', title: 'Commission Revenue by Month', reportKey: 'commission-revenue', filters: {}, dimension: 'month' },
        { id: 'premium-aging', title: 'Premium Aging by Branch', reportKey: 'premium-aging-by-branch', filters: {}, dimension: 'branch' },
        { id: 'pipeline-conversion', title: 'Sales Pipeline Conversion', reportKey: 'sales-pipeline-conversion-velocity', filters: {} },
        { id: 'portfolio-concentration', title: 'Top Accounts by Premium', reportKey: 'account-portfolio-concentration', filters: { topN: 10 } },
        { id: 'lead-source-roi', title: 'Lead Source & Campaign ROI', reportKey: 'lead-source-campaign-roi', filters: {} },
        { id: 'sla-compliance', title: 'SLA Compliance by Team', reportKey: 'sla-compliance-by-team', filters: {} },
      ],
    },
    {
      name: 'Branch Manager Dashboard',
      widgets: [
        { id: 'broker-productivity', title: 'Broker Productivity', reportKey: 'broker-productivity', filters: {}, dimension: 'broker' },
        { id: 'policy-lapse-rate', title: 'Policy Lapse Rate by Branch', reportKey: 'policy-lapse-rate', filters: {}, dimension: 'branch' },
        { id: 'renewal-pipeline', title: 'Renewal Pipeline by Carrier', reportKey: 'renewal-pipeline-by-carrier', filters: {} },
        { id: 'agent-throughput', title: 'Agent Case Throughput', reportKey: 'agent-case-throughput', filters: {} },
        { id: 'case-resolution-time', title: 'Case Resolution Time by Category', reportKey: 'case-resolution-time-by-category', filters: {} },
      ],
    },
    {
      name: 'Broker Dashboard',
      widgets: [
        { id: 'my-productivity', title: 'My Productivity', reportKey: 'broker-productivity', filters: {}, dimension: 'broker' },
        { id: 'my-renewals', title: 'My Renewal Pipeline', reportKey: 'renewal-pipeline-by-carrier', filters: {} },
        { id: 'market-submissions', title: 'Market Submission Performance', reportKey: 'market-submission-performance', filters: {} },
        { id: 'lead-source-roi', title: 'Lead Source & Campaign ROI', reportKey: 'lead-source-campaign-roi', filters: {} },
        { id: 'case-reopen-quality', title: 'Case Reopen & Quality Rate', reportKey: 'case-reopen-quality-rate', filters: {} },
      ],
    },
    {
      name: 'Compliance Dashboard',
      widgets: [
        { id: 'doc-compliance', title: 'Document Compliance Readiness', reportKey: 'document-compliance-readiness', filters: {} },
        { id: 'complaint-trends', title: 'Complaint Case Volume Trends', reportKey: 'complaint-case-volume-trends', filters: {}, dimension: 'month' },
        { id: 'claims-turnaround', title: 'Claims Turnaround Time', reportKey: 'claims-turnaround-time', filters: {} },
        { id: 'sla-compliance', title: 'SLA Compliance by Team', reportKey: 'sla-compliance-by-team', filters: {} },
        { id: 'case-resolution-time', title: 'Case Resolution Time by Category', reportKey: 'case-resolution-time-by-category', filters: {} },
      ],
    },
  ];

  for (const dashboard of dashboards) {
    const existing = await prisma.savedDashboard.findFirst({ where: { name: dashboard.name, visibility: 'ORG' } });
    if (existing) continue;
    await prisma.savedDashboard.create({
      data: {
        name: dashboard.name,
        visibility: 'ORG',
        ownerId,
        layoutConfig: {
          columns: 12,
          items: dashboard.widgets.map((w, i) => ({ widgetId: w.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 })),
        } satisfies Prisma.InputJsonValue,
        widgets: dashboard.widgets satisfies Prisma.InputJsonValue,
      },
    });
  }
}
