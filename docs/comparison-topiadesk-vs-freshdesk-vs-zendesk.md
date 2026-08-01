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

**TopiaDesk**: the `ai-gateway` module is designed around an `AiUsageLedger`
table (`packages/db/prisma/schema.prisma`) recording tokens and estimated
cost per request, gated by `AI_ORG_MONTHLY_SPEND_CAP_USD` and
`AI_PER_USER_DAILY_REQUEST_CAP` (`.env.example`) — a hard ceiling, not a
metered-and-hope model. *(Implementation status: the endpoint contract is
live and Swagger-documented; the Anthropic SDK wrapper and the actual cap
enforcement are Batch 1 scope — see the module's header comment in
`apps/api/src/modules/ai-gateway/ai-gateway.controller.ts`. Flagged here as
an architectural commitment already reflected in the schema, not yet a
shipped feature.)*

## Honest scope comparison

TopiaDesk Phase 1 is **not** a feature-complete Freshdesk/Zendesk
replacement — it's a deep, production-hardened build of the modules Scib's
BRD scoped as Phase 1 (org/RBAC/SSO, Client/Prospect 360, Lead/Opportunity
pipeline, Policy lifecycle, Documents, audit trail, one proven integration
connector, foundation AI, an operational dashboard). Freshdesk/Zendesk are
mature, broad platforms with large app marketplaces (Freshdesk ~1,200+ apps,
Zendesk's marketplace generally regarded as broader/more flexible),
established omnichannel ticketing, and years of production hardening across
thousands of customers. TopiaDesk's bet is narrower and deeper: match their
core engagement-layer capability while being architecturally correct in the
specific places that matter most for a regulated insurance brokerage, where
generic helpdesk platforms have documented, structural gaps.

Claims management, complaint/enquiry tracking, campaign management, a full
BI/reporting suite, and predictive AI scoring are explicitly Phase 2/3 — see
`docs/roadmap-phase2-3.md` for the concrete plan, not vaporware.
