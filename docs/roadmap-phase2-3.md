# TopiaDesk CRM — Phase 2 & Phase 3 Roadmap

Phase 1 (this build) delivers a deep, production-grade foundation: org/RBAC/SSO,
Client & Prospect 360 (Account/Contact/Carrier), Lead/Opportunity pipeline,
Policy lifecycle with renewal alerts, Documents, an immutable audit trail, an
integration framework proven with a working mock connector, foundation AI
features, and an operational dashboard. Everything below is deliberately
**not** built yet — scoped out by explicit choice (see
`/Users/geremoses/.claude/plans/lucky-discovering-harp.md`) so Phase 1 could
be genuinely production-hardened rather than spread thin across every BRD
module. This document is the concrete contract for what comes next.

---

## Phase 2 — Extended Functional Modules

### Claims Management
- **Entities**: `Claim` (policyId, claimNumber, dateOfLoss, dateReported, status,
  causeOfLoss, reserveAmount, settledAmount), `ClaimStatusHistory`,
  `ClaimDocument` (reuses the existing polymorphic `DocumentLink` pattern —
  `DocumentEntityType` enum just needs a `CLAIM` value added).
- **Workflow**: status progression (Notified → Under Review → Adjusted →
  Settled/Repudiated) with SLA-driven turnaround per stage, escalation on
  overdue stages — built on the same `AutomationRule` engine and
  `Notification.dedupeKey` idempotency pattern already proven for renewal
  alerts in Phase 1's `backend/worker/src/jobs/renewal-alerts/`.
- **Dependency**: insurer portal integration for real-time claim status
  (extends the `IntegrationConnector`/`SyncJob`/`IntegrationLog` framework
  already built — a second connector implementation alongside the Phase 1
  mock, this time against a real Core Broking System / insurer portal API).

### Enquiry, Service Request & Complaint Management
- **Entities**: a unified `Case` table (caseType: ENQUIRY | SERVICE_REQUEST |
  COMPLAINT, status, priority, category, resolutionNotes, resolvedAt) —
  mirrors the `Task` table's direct-FK pattern (accountId, policyId nullable)
  rather than introducing new polymorphism.
- **Regulatory reporting**: complaint trend/volume exports for NAICOM-style
  filings — an extension of the dashboard export capability below, not a new
  subsystem.

### Full SLA & Workflow Automation Engine
- Phase 1 shipped a **foundation-tier** automation engine
  (`AutomationRule`: trigger/conditions/actions as jsonb, action handlers
  registered via an interface) sufficient for renewal alerts and simple
  reminders. Phase 2 extends this into genuine multi-step, branching,
  multi-level-approval workflows (claims lifecycle, complex endorsement
  approval chains) — architecturally this is where the `Approval`
  maker-checker table (already in Phase 1, satisfying the segregation-of-
  duties NFR) gets a real workflow designer UI in front of it, and where a
  decision is needed: extend the jsonb rule engine further, or integrate a
  proven BPMN engine (Camunda 8/Zeebe is the leading self-hostable option).
  **Recommendation**: prototype both against 2-3 real Phase 2 workflows
  before committing — this is the single largest architectural fork in the
  whole roadmap and deserves a dedicated spike, not a default choice made
  here.

### Communication & Campaign Management
- Bulk email/WhatsApp campaign sending, template management, engagement
  tracking (opens/clicks). The `Activity` table's `WHATSAPP` type already
  exists in the Phase 1 schema for individual interaction logging — campaigns
  are a new `Campaign`/`CampaignRecipient` layer on top, not a schema change
  to `Activity`.
- WhatsApp Business API integration requires a Meta Business account and
  approved message templates — an external dependency, not just engineering
  work.

### Customer Survey & Loyalty
- `Survey`/`SurveyResponse` (NPS/CSAT) and `LoyaltyAccount`/`LoyaltyTransaction`
  (points earn/redeem) — both clean additive schema, low coupling to Phase 1
  entities beyond a nullable `accountId` FK.

---

## Phase 3 — Advanced Analytics & Optimization

### Full Reporting, Analytics & AI Suite
- Phase 1 shipped one operational KPI endpoint
  (`GET /dashboards/operational-kpis`) and the `SavedDashboard` schema with
  its fixed-report-key-only constraint (deliberately no ad-hoc query builder
  — that's an injection risk without a proper semantic layer). Phase 3 adds:
  executive/technical/sales/claims/compliance dashboard variants, drill-down
  navigation, an ad-hoc report builder (this is where a real semantic layer —
  e.g. Cube.js or a hand-built one — becomes necessary to do safely), and
  export to Excel/PDF/BI tools.
- **Predictive analytics** (renewal probability, churn/retention risk, lead
  prioritization): requires real historical data volume Phase 1 won't yet
  have. The `AiUsageLedger` and pgvector `SemanticEmbedding` table are
  already in place as the foundation; actual model training/scoring jobs are
  Phase 3 work once there's enough seasoned data to train against.
- **Prescriptive analytics / AI-driven recommendations**: builds on the
  predictive layer above — sequenced after it, not parallel to it.

### Advanced Integrations
- Real-time (not just polling) insurer/reinsurer portal integrations where
  technically feasible, ERP bidirectional sync for invoicing/reconciliation,
  ISO 42001-aligned AI governance documentation as the AI feature surface
  grows beyond summarization/copilot into actual predictions.

### Mobility
- Phase 1's web app is responsive/PWA-capable by default (standard Next.js
  practice, not a separate build). Native iOS/Android apps and offline
  sync with conflict resolution are Phase 3 — offline-first sync design is
  nontrivial enough (conflict resolution against RLS-scoped data
  specifically) to warrant its own spike before committing to React Native
  vs. platform-native.

---

## What does NOT change when these land

Every Phase 2/3 addition should compose with what Phase 1 already built,
not replace it:
- New entities follow the same conventions: `snake_case` DB columns via
  Prisma `@map`, direct nullable FKs over polymorphism unless the linkable
  set is genuinely open-ended (Document is the one deliberate exception),
  RLS policies via the `app_can_access_owner()` / `app_max_scope()` helper
  functions already defined in `packages/db/prisma/rls/002_policies.sql`.
- New tracked tables get audit coverage by adding their name to the array in
  `packages/db/prisma/triggers/002_audit_chain_triggers.sql` (one line) —
  the hash-chain trigger itself needs no changes.
- New automation needs register an `AutomationActionHandler`, they don't
  fork the engine.
