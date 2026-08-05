# TopiaDesk CRM — Phase 2 & Phase 3 Roadmap

Phase 1 delivered a deep, production-grade foundation: org/RBAC/SSO,
Client & Prospect 360 (Account/Contact/Carrier), Lead/Opportunity pipeline,
Policy lifecycle with renewal alerts, Documents, an immutable audit trail, an
integration framework proven with a working mock connector, foundation AI
features, and an operational dashboard.

**This document originally scoped everything below as "not built yet."
That's no longer accurate.** Across the Phase 2 batches that followed, most
of the functional-module list was actually delivered — Claims, the unified
Case model (Enquiry/Service Request/Complaint), a full case-routing
configuration surface (SLA Policies, Macros, Assignment Rules, Business
Hours, Agent Skills, Case/Loss-Cause Category hierarchies), Campaigns,
Surveys, and — as of the most recent pass — Customer Loyalty. This revision
marks each item **Delivered** or **Not built** honestly, so this file stays
a trustworthy status source rather than drifting into aspirational
documentation. See git history for exactly which commits landed each piece.

---

## Phase 2 — Extended Functional Modules

### Claims Management — **Delivered**
`Claim`/`ClaimStatusHistory` exist (`backend/api/src/modules/case-management/
claims.controller.ts`), with document attachment via the existing
polymorphic `DocumentLink` pattern, macro-driven bulk actions
(`POST /claims/:id/apply-macro/:macroId`), and RLS scoped through
Policy→Account ownership. **Not built**: a second, real connector against an
actual Core Broking System / insurer portal API for live claim-status sync —
the Phase 1 mock connector is still the only proven `IntegrationConnector`
implementation. That remains genuine future work, gated on a real insurer
partner integration to build against.

### Enquiry, Service Request & Complaint Management — **Delivered**
The unified `Case` model (`caseType: ENQUIRY | SERVICE_REQUEST | COMPLAINT`,
status/priority/category/resolutionNotes/resolvedAt, `createdById` tracking
the requester distinct from the assignee) is built exactly as originally
scoped here — direct nullable FKs (accountId/policyId), not polymorphism.
`CaseCategory`/`LossCauseCategory` got a self-relation hierarchy (parentId/
children) with tree UI. **Regulatory reporting** (complaint trend/volume
exports for NAICOM-style filings) is also delivered, and turned out to need
no new subsystem at all: the "Complaint Case Volume Trends" report
(`packages/reports/src/definitions/complaint-case-volume-trends.ts`,
category `COMPLIANCE`) already trends complaint volume/resolution time by
status/priority/category/month, and the generic report-export pipeline
(`GET /reports/:key/export?format=csv|xlsx|pdf`, MinIO-backed presigned
download) already applies to it — verified live: all three formats produce
a correctly-headered file (`Status,Priority,Category,Month,Complaints,
Resolved,Avg Resolution (days)`).

### Full SLA & Workflow Automation Engine — **Partially delivered**
The case-routing *configuration* surface Phase 1 scoped as foundation-tier
is now fully built out: `SlaPolicy` (with rank-based tiebreaking),
`AssignmentRule` (team picker + validated conditions), `BusinessHoursCalendar`/
`BusinessHoliday`, `AgentSkill`, `Macro` (categorized/grouped), all with
RBAC-gated UIs. `AutomationRule`'s trigger/conditions/actions-as-jsonb
engine is wired to real events (case status transitions, ENTITY_EVENT
dispatch). **Still not built**: genuine multi-step, branching, multi-level-
approval workflows — the architectural fork this document originally
flagged (extend the jsonb engine further vs. integrate a BPMN engine like
Camunda 8/Zeebe) is still live and still deserves its own spike before
committing, exactly as originally written. Nothing since has resolved that
decision; it isn't accidentally-skipped work, it's a deliberate open fork.

### Communication & Campaign Management — **Delivered** (with one caveat)
`Campaign`/`CampaignTemplate`/`CampaignVariant`/`CampaignRecipient`/
`AudienceSegment`/`CampaignSuppression` are all built, with a dispatch queue,
webhook-driven engagement tracking (opens/clicks via provider callbacks),
and a suppressions list endpoint. **Not built**: live WhatsApp Business API
sending — that remains gated on a real Meta Business account and approved
message templates, an external dependency this codebase can't satisfy on
its own regardless of engineering effort. Email/SMS channels are fully live.

### Customer Survey & Loyalty — **Delivered**
`Survey`/`SurveyResponse` (NPS/CSAT) are built and wired to
`CASE_RESOLVED`-triggered dispatch (producer + worker consumer + email).
**Loyalty** (`LoyaltyAccount`/`LoyaltyTransaction`) landed as an
append-only points ledger — deliberately no stored balance column (always
`SUM(points)`, computed inside the same row-locked transaction that posts a
new entry, so there's no separate "keep the balance in sync" step that could
drift or race); large redemptions and manual corrections require an
ALL-scope (department-head-or-above) caller, verified live including the
overdraft-rejection and cross-account RLS-denial paths. Reachable from an
Account's own detail page (Loyalty tab) and a program-wide `/loyalty` list.

---

## Phase 3 — Advanced Analytics & Optimization

### Full Reporting, Analytics & AI Suite — **Partially delivered**
Phase 1 shipped one operational KPI endpoint; since then, a real Reports
module landed — a registry of report definitions (`packages/reports`), an
ad-hoc custom-report builder (`custom-report.controller.ts`, entity/field
picker + filter/groupBy), scheduled report delivery, and — most recently —
chart-type-aware rendering (bar/stackedBar/line/funnel/table/treemap/gauge,
with graceful fallback to the data table when a result's shape doesn't fit
its declared chart). This covers a meaningful slice of what this section
originally scoped as Phase 3. **Still not built**: role-flavored dashboard
*variants* beyond what `/dashboards/*` already renders, drill-down
navigation from a chart into its underlying rows, and — the two genuinely
data-hungry items — **predictive analytics** (renewal probability, churn
risk, lead prioritization) and **prescriptive recommendations** built on top
of it. Both still require real historical data volume this system won't
have until it's run in production for a while; the `AiUsageLedger` and
pgvector `SemanticEmbedding` table remain the correct foundation to build
on once that data exists.

### Advanced Integrations — **Not built**
Real-time (not polling) insurer/reinsurer portal integrations, ERP
bidirectional sync, and ISO 42001-aligned AI governance documentation as the
AI surface grows — all still genuinely Phase 3, all still gated on a real
external counterparty to integrate against (same shape as Claims' insurer-
portal gap above) rather than on more internal engineering time.

### Mobility — **Not built**
The web app is responsive/PWA-capable by default (Next.js standard
practice). Native iOS/Android apps and offline sync with conflict
resolution are unstarted — offline-first sync against RLS-scoped data is
nontrivial enough to warrant its own spike (React Native vs. platform-
native) before committing, exactly as originally scoped.

---

## What does NOT change when the remaining items land

Every addition composes with what's already built, not replace it:
- New entities follow the same conventions: `snake_case` DB columns via
  Prisma `@map`, direct nullable FKs over polymorphism unless the linkable
  set is genuinely open-ended (Document is the one deliberate exception),
  RLS policies via the `app_can_access_owner()` / `app_max_scope()` helper
  functions already defined in `packages/db/prisma/rls/002_policies.sql`.
- New tracked tables get audit coverage by adding their name to the array in
  `packages/db/prisma/triggers/002_audit_chain_triggers.sql` (one line) —
  the hash-chain trigger itself needs no changes.
- New automation needs register an `AutomationActionHandler`, they don't
  fork the engine (until/unless the BPMN-engine fork above is actually
  decided and taken).
- A ledger-shaped feature (Loyalty's pattern: append-only rows, balance
  always computed not stored, row-locked inside one manually-managed
  `prisma.$transaction`) is the template for any future balance/counter
  that must stay correct under concurrent writes — see
  `backend/api/src/modules/loyalty/loyalty-ledger.util.ts`'s header comment
  for why `getPrismaClient()`'s normal per-call RLS wrapping can't be used
  for this and what to do instead.
