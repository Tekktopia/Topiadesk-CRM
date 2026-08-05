# TopiaDesk CRM vs. Freshdesk vs. Zendesk

Grounded in two things: (1) researched findings on Freshdesk/Zendesk
enterprise-tier capabilities and documented limitations (G2/Capterra/
TrustRadius reviews, vendor docs, 2026 pricing trackers), and (2) what's
**actually been built and verified** in this codebase, not aspirational
claims — every row below either cites a specific file in this repo or is
explicitly marked as roadmap (see `docs/roadmap-phase2-3.md`).

## The four differentiators, and why they matter for an insurance brokerage

### 1. Row-level security vs. coarse role-based access

**Freshdesk/Zendesk**: both offer custom *agent roles*, scoped by group/skill
— coarse role-based access control. Neither exposes attribute/relationship-
based access (e.g., "this broker sees only policies in their own book of
business") without custom scripting on top of the platform.

**TopiaDesk**: Postgres row-level security, enforced at the database layer —
not just the application layer — via `app_max_scope()` /
`app_can_access_owner()` (`packages/db/prisma/rls/002_policies.sql`),
resolving OWN/DEPARTMENT/BRANCH/ALL scope per resource+action from the real
`Permission`/`Role`/`UserRole` grant tables, correctly aggregating across a
user's multiple assigned roles. **Verified**: a session with no bound
identity returns zero rows on every scoped table (fails closed); a broker
sees only their own accounts; a department manager sees their department's
records; direct SQL tampering with `audit_log` is rejected with `permission
denied` even connecting as the same database role the application uses (see
`packages/db/test/rls-and-audit.integration.test.ts`, 9/9 passing against a
live Postgres instance). This holds even if application code has a bug —
the database itself won't return rows outside a user's scope.

### 2. Cryptographically hash-chained audit trail vs. a standard activity log

**Freshdesk/Zendesk**: standard activity/change logs exist, but neither
publicly documents a tamper-evident, cryptographically verifiable audit
mechanism — a real gap for E&O and regulatory exposure in insurance broking.

**TopiaDesk**: every write to a compliance-relevant table is captured by a
generic database trigger (not just an application-layer interceptor that a
future module could forget to call —
`packages/db/prisma/triggers/002_audit_chain_triggers.sql`), and `audit_log`
itself is hash-chained (`sha256(prev_hash + payload)`, computed **in
Postgres** to avoid app/verifier serialization drift), partitioned into 8
concurrency lanes so the chain isn't a throughput bottleneck, with periodic
checkpoints anchoring all lanes. The table is structurally append-only:
`UPDATE`/`DELETE`/`TRUNCATE` are revoked from the application's database
role, and no RLS policy permits either operation — two independent
enforcement mechanisms, not one. **Verified**: every stored hash
independently recomputes correctly; a deliberately corrupted row is detected
by the verification query; `create_audit_checkpoint()` produces a valid
64-hex-char anchor.

### 3. Deep native insurance entity graph vs. bolted-on custom objects

**Freshdesk/Zendesk**: custom objects (Freshdesk Pro/Enterprise) and
Zendesk's Custom Objects framework (its predecessor, "Sunshine" custom
objects, is being fully deprecated by Zendesk in 2026) both cap out well
short of modeling real insurance entity relationships — reviewers
specifically cite "shallow relationship depth" as a limitation.

**TopiaDesk**: the schema treats insurance concepts as first-class relational
data, not bolted-on custom fields — e.g. `OpportunityMarketSubmission`
models an opportunity shopped to multiple carriers simultaneously (a routine
brokerage workflow that a plain Opportunity→Carrier foreign key can't
represent), `Carrier` unifies Insurer/Reinsurer via a type enum rather than
forcing two disconnected object types, and `Policy` → `PolicyVersion` →
`Premium` → `RenewalSchedule` model the full lifecycle with proper
versioning rather than mutable single rows (`packages/db/prisma/schema.prisma`).

### 4. Cost-predictable, capped AI vs. uncapped per-resolution billing

**Zendesk** (specifically): since a January 2026 pricing change, AI
resolutions bill per-resolution, uncapped and auto-charged on top of seats —
a named pain point in reviews, with stacked add-ons (Copilot, WFM) pushing
effective cost up to ~87% above base seat price. **Freshdesk**: AI Copilot
sessions are metered per-100-session blocks or a flat per-agent add-on.

**TopiaDesk**: the `ai-gateway` module wraps the real Anthropic SDK
(`backend/api/src/modules/ai-gateway/anthropic-client.ts`) behind an
`AiUsageLedger` table (`packages/db/prisma/schema.prisma`) recording tokens
and estimated cost per request, checked **before** every metered call —
never after — against `AI_ORG_MONTHLY_SPEND_CAP_USD` (summed org-wide under
elevated `SYSTEM_JOB_CONTEXT`, so the cap sees true total spend, not just
one user's RLS-scoped slice) and `AI_PER_USER_DAILY_REQUEST_CAP`
(`ai-gateway.service.ts`) — a hard ceiling enforced in code, not a
metered-and-hope model or an aspirational schema field.

## Phase 2: six more differentiators, now built and verified

Phase 2 moved Claims/Complaints, a knowledge base, campaigns, deeper CRM
tooling, BI/reporting, and admin/AI/integrations from the roadmap doc into
real, migrated, RLS-covered, audit-covered, live-verified code
(`packages/db/prisma/schema.prisma`'s Phase 2 sections;
`backend/api/src/modules/{case-management,knowledge-base,surveys,crm,reports,campaigns,admin}/`).
Each keeps the same discipline as Phase 1: cite a mechanism, not a claim.

### 5. Separate Claim/Case entities vs. one generic Ticket

**Freshdesk/Zendesk**: both model everything as a single Ticket type. An
insurance claim gets bolted onto that shape via custom fields, inheriting a
generic support-ticket status machine that has no concept of a loss event,
a catastrophe, or a reserve amount.

**TopiaDesk**: `Claim` and `Case` are distinct tables with distinct status
machines, sharing SLA/watcher/audit infrastructure through a Contact-style
dual-nullable-FK pattern rather than forcing one shape to fit both. Claims
carry first-class `CatastropheEvent` and `LossCauseCategory` relations — a
mass-loss event (e.g. a flood) can be linked across every affected claim for
real reserve/exposure reporting, something a generic ticket's custom-field
bag can't represent relationally.

### 6. One governance primitive for every approval, not a per-feature bolt-on

**Freshdesk/Zendesk**: knowledge-base publishing controls, where they exist,
are a feature of the KB module specifically — a separate mechanism from
whatever change-control exists elsewhere in the platform.

**TopiaDesk**: Knowledge Article publishing reuses the exact same
maker-checker `Approval` table introduced in Phase 1 for policy/financial
actions (`ApprovalEntityType.KNOWLEDGE_ARTICLE_PUBLISH`) — one segregation-
of-duties primitive, audited the same way, queried the same way, everywhere
in the platform. **Verified**: a requester's own "Decide" action is
disabled client- and server-side; a second user with `approval:write`
successfully approves and the article flips to Published.

### 7. A fixed report registry vs. an open query surface

**Freshdesk/Zendesk**: Explore (Zendesk) and Analytics (Freshdesk) both let
users build reports against a broad metric/attribute surface.

**TopiaDesk**: reports are a code-defined registry
(`backend/api/src/modules/reports/registry/report-definition.ts`) — each
`ReportDefinition` ships its own Zod filter schema and a fixed
`allowedDimensions` enum; a `dimension` value is never interpolated into SQL,
only used as a post-query JS pivot key. The tradeoff is deliberate: no
ad-hoc-query surface means no query-injection attack surface, at the cost of
end-user report flexibility — the right tradeoff for a platform holding
regulated financial and PII data. **Verified**: `GET /reports` returns all
12 live definitions with real filter schemas; running one against seeded
data returns correct pivoted rows; CSV/Excel/PDF export round-trips through
a signed MinIO URL.

### 8. Dedup/merge that reads the live schema, not a hand-maintained list

**Freshdesk/Zendesk** merge tools reassign a fixed, documented set of
related records — a list that goes stale the moment a new relation is added
to the platform without someone remembering to update the merge logic too.

**TopiaDesk**'s merge service (`backend/api/src/modules/crm/merge.ts`)
enumerates the *actual* foreign keys pointing at the losing record via a
live `information_schema` query at merge time, not a hardcoded reassignment
list — so a schema change can never silently leave orphaned or
un-reassigned data behind. It reassigns every in-scope relation, blocks
with a clear error on any out-of-scope cascade it doesn't know how to
handle safely, and only deletes the loser as the last step.

### 9. Campaign suppression enforced against one CRM contact record

**Zendesk** has no native marketing-campaign module — sending a campaign
means integrating a separate marketing tool, which means a second, separate
opt-out/suppression list that can drift from the support platform's own
contact preferences. **Freshdesk**'s campaign tooling lives in a
separate product (Freshworks CRM), with the same integration-boundary risk.

**TopiaDesk**'s `CampaignSuppression` table is enforced against the same
`Contact`/`Account` records — RLS-scoped and audit-logged like everything
else in the platform — that every other module reads and writes. There is
no second system for an opt-out to fail to propagate to. **Verified**: a
real segment→template→campaign→send flow produced an actual delivered
email in MailDev with correct merge-field substitution end-to-end.

### 10. AI sentiment/embeddings under the same spend cap, not a new bolt-on bill

**Zendesk**, per differentiator 4, bills AI resolutions uncapped and
per-resolution; new AI capabilities (like sentiment) typically stack as
another metered add-on. **Freshdesk** meters Copilot sessions separately
per feature.

**TopiaDesk**'s Phase 2 AI additions — sentiment analysis, auto-
categorization, semantic embeddings (pgvector, `vector(1024)` for Voyage AI)
and semantic search — all route through the exact same `AiUsageLedger`-
capped gateway built in Phase 1, checked against the same org-wide monthly
spend cap before every call. A new AI feature is a new `AiFeature` enum
value against an already-enforced ceiling, not a new billing surface.

## Phase 2.5: four more differentiators — information architecture, not just architecture

The prior ten differentiators are all backend/data-model claims. This section
is different: it's a direct structural audit of Freshdesk's and Zendesk's
actual navigation, list-view, search, and workflow-configuration UX —
researched specifically because TopiaDesk's own frontend, prior to this
pass, genuinely fell short of that bar (a flat, uncategorized admin nav;
static tables with no real sort/pagination; module-scoped search only). Each
gap identified here was closed in code in this same pass, not just
documented.

### 11. Purpose-grouped admin navigation vs. a flat list

**Freshdesk**: buckets admin settings into six categories — Team, Channels,
Workflows, Agent Productivity, Support Operations, Account — with blurry
boundaries; Freshdesk's own documentation lists "Ticket Fields" under two
different buckets. **Zendesk**: Admin Center uses a cleaner, noun-based
split instead — Account, People, Channels, AI, Workspaces, Objects and
Rules, Apps and Integrations.

**TopiaDesk**: the admin area was a flat, uncategorized 12-item list — the
exact gap this comparison was commissioned to close. Rebuilt on Zendesk's
cleaner noun-based principle rather than Freshdesk's blurred one: **People &
Access** (Users, Roles & Permissions, Departments, Branches, Teams),
**Security** (IP Whitelist, SCIM Tokens, Audit Log), **System** (Org
Settings, Integrations, Webhooks, Notifications) — collapsible sections with
state persisted per browser (`frontend/web/app/(admin)/nav.ts`,
`frontend/web/app/app-sidebar.tsx`).

### 12. A real data-grid engine under every list vs. a static table

**Freshdesk**: the ticket list ships three interchangeable view modes —
Card, Table, Inbox — each with independent sorting and column control.
**Zendesk**: list views support saved views with custom column sets.

**TopiaDesk**: every list page — Accounts, Contacts, Leads, Cases, Claims,
Policies, Documents, the whole Admin section, roughly 28 pages total — now
sits on one shared `DataTable` composite built on TanStack Table v8: real
column sort, pagination, show/hide columns, and consistent row-selection for
bulk actions, instead of each page hand-rolling its own
(`packages/ui/src/composite/data-table.tsx`, retrofitted across ~28 pages).
Card/Inbox-style alternate view modes are not built — the grid underneath is
now real; that specific Freshdesk view-switching pattern isn't replicated.

### 13. One global search vs. eleven separate module searches

**Freshdesk/Zendesk**: search is scoped to whichever module you're currently
in — finding a contact while looking at a ticket means leaving to a
separate search screen.

**TopiaDesk**: a single `⌘K` opens a command palette that fans one query
out, in parallel, across 11 entity types — accounts, contacts, leads,
opportunities, carriers, tasks, policies, claims, cases, campaigns,
knowledge articles (`backend/api/src/modules/search/`,
`frontend/web/app/command-palette.tsx`). It's RLS-scoped for free, since it
reuses the exact same `getPrismaClient()` every other query in the platform
goes through — not a separate search index with its own permission model
that could drift out of sync.

### 14. One rule table vs. three separately-configured automation engines

**Freshdesk**: splits automation by trigger type into three separately
configured tools — Dispatch'r (ticket creation), Supervisor (ticket
updates), Observer (event-based actions) — plus a separate Scenario
Automations tool for one-click bulk actions. Four different places to check
for "why did this happen."

**TopiaDesk**: `AutomationRule` is one table — trigger, conditions, and
actions all `jsonb` — with action handlers registered behind a shared
interface, so every rule is defined, audited, and queried the same way
regardless of what triggers it (`packages/db/prisma/schema.prisma`). The
honest tradeoff: Freshdesk's three tiers each get a purpose-built
configuration wizard; TopiaDesk trades that specialization for one
consistent, generic model — no per-tier wizard UI is built.

## Honest scope comparison

TopiaDesk's backend now covers org/RBAC/SSO, Client/Prospect 360,
Lead/Opportunity pipeline, Policy lifecycle, Documents, the audit trail, one
proven integration connector, an operational dashboard (all Phase 1) plus
Claims/Case management with SLA clocks and macros, a Knowledge Base with
maker-checker publishing, CSAT/NPS/CES surveys, custom fields/saved
views/dedup-merge/sales quotas, a fixed-registry BI/reporting suite with
scheduled delivery, email/SMS/WhatsApp campaigns, and SCIM/webhooks/force-
logout/AI-sentiment admin tooling (all Phase 2) — every one migrated,
RLS-covered, audit-covered, and empirically verified against a live stack,
not just designed. Frontend UI for every Phase 1/2 module — including the
grouped admin navigation, shared data-grid, and global search from the
section above — is now live against that same backend, not just designed.

What's still genuinely ahead of TopiaDesk: Freshdesk/Zendesk's large app
marketplaces (Freshdesk ~1,200+ apps; Zendesk's generally regarded as
broader/more flexible), true omnichannel channel breadth (native voice,
social DMs) beyond what this platform's `ActivityType` enum currently
models, Freshdesk's Card/Inbox alternate list-view modes and its three
purpose-built per-tier automation wizards (§12, §14 above), and years of
production hardening across thousands of customers that no single build
cycle can replicate. TopiaDesk's bet remains narrower and deeper: match and
in specific, cited places exceed their core engagement-layer capability —
now including navigation clarity and search ergonomics, not just backend
architecture — while being structurally correct where generic helpdesk
platforms have documented gaps: row-level security, a tamper-evident audit
chain, a real insurance entity graph, and cost-predictable AI, extended
across six more modules. Predictive ML/scoring remains Phase 3 — see
`docs/roadmap-phase2-3.md`.
