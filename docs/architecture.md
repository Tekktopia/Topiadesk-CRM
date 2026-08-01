# TopiaDesk CRM — Architecture

## What this is

TopiaDesk CRM is a single-tenant, enterprise-grade CRM built for Scib Nigeria
(insurance brokerage), scoped per its BRD as the **engagement layer** — client
lifecycle visibility, pipeline management, coordination — not the system of
record for policy administration, claims adjudication, or financial
transactions. Those remain in Scib's Core Broking System and ERP, which
TopiaDesk integrates with (see `apps/api/src/modules/integrations/`).

It's built to be materially more capable than Freshdesk/Zendesk for this use
case in four specific ways, each addressing a documented gap in those
platforms (see `docs/comparison-topiadesk-vs-freshdesk-vs-zendesk` for the
research backing this): native Postgres row-level-security instead of
coarse role-based access, a cryptographically hash-chained immutable audit
log instead of a standard activity log, a deep native insurance entity graph
(multi-carrier market submissions, carrier-vs-account distinction) instead of
bolted-on custom objects, and a cost-capped AI gateway instead of uncapped
per-resolution billing.

## Monorepo layout

```
apps/
  api/      NestJS — the only writer of business data, all Prisma access goes through it or worker
  web/      Next.js 15 (App Router) — the UI
  worker/   BullMQ background jobs (renewal alerts, audit checkpoints, premium aging refresh)
packages/
  db/       Prisma schema (single source of truth) + hand-written RLS/audit SQL + RLS-aware client
  config/   zod-validated environment schema, shared by api/worker
  shared-types/  hand-mirrored enums + generated OpenAPI-derived types, shared by api/web
  ui/       shadcn/ui-based design system, shared by web
infra/      Docker Compose service configs (Postgres, Keycloak, Traefik, observability stack)
docs/       this file, the Phase 2/3 roadmap, the operational runbook
```

## Request path

```
Browser → Traefik (TLS) → apps/web (Next.js, session cookie)
                              │  Authorization: Bearer <Keycloak access token>
                              ▼
                          apps/api (NestJS)
   RlsContextMiddleware ──► verifies JWT via Keycloak JWKS
                         ──► resolves local User + roles (users/roles tables, no RLS)
                         ──► binds an RlsContext into AsyncLocalStorage
   PermissionGuard       ──► coarse "any grant for resource:action?" check → 403 fast if not
   Controller            ──► calls packages/db's RLS-aware Prisma client
   Prisma client         ──► wraps the call in $transaction(async tx => {
                              SET session vars (app.current_user_id/role/dept_id/branch_id/client_ip);
                              run the actual query on the SAME connection
                            })
   Postgres RLS policies ──► filter rows using those session vars — the backstop
                              that holds even if the guard above has a bug
```

Two independent authorization layers exist on purpose: the `PermissionGuard`
gives clean 403s without a wasted DB round-trip for obviously-unauthorized
calls; Postgres RLS is what actually can't be bypassed by an application bug.
Neither layer alone is "the" authorization system.

## Why a Prisma Client Extension using `$transaction([...])` batching does NOT appear anywhere in this codebase

It was the original design (see the architecture review baked into the
approved plan) and it does not work — confirmed empirically. `set_config(...,
true)` from one array-batched statement did not reliably apply before the
paired query executed in the same batch; a user scoped to see 1 row saw 0.
The actual implementation (`packages/db/src/client.ts`) uses Prisma's
**interactive** transaction API (`$transaction(async (tx) => {...})`), which
is documented to pin one physical connection for the callback's lifetime —
verified correct, including under 10 concurrent requests with different
contexts (no session-variable bleed). If you're extending this client, read
the comment block at the top of that file before changing the mechanism.

## Data model conventions

- Every table: `snake_case` columns via Prisma `@map`/`@@map`, PascalCase
  Prisma models.
- Direct nullable FKs over polymorphism, *except* `DocumentLink`
  (`entityType` + `entityId`) — the one place a genuinely open-ended,
  growing set of linkable entities justifies it. Don't add a second
  polymorphic table without the same justification.
- `Carrier` unifies Insurer/Reinsurer via a `carrierType` enum — they're
  ~95% the same shape; don't split them back out.
- Money fields are `Decimal`, never `Float`.
- Every UUID PK is `gen_random_uuid()` (Postgres-native since PG13, via the
  `pgcrypto` extension) — DB-generated, not client-generated, so rows
  inserted by raw SQL (migrations, the audit trigger) get valid IDs too.

## Row-level security

`packages/db/prisma/rls/002_policies.sql` implements scope resolution via
`app_max_scope(resource, action)`, which joins **all** of a user's assigned
roles (not a single "primary role") to find their highest granted scope
(OWN < DEPARTMENT < BRANCH < ALL) for a resource/action pair — correctly
handling multi-role users without special-casing. `app_can_access_owner()`
then checks whether a specific row's owner falls within that scope.

Two roles have a hard-coded fast path (`ADMIN`, `SYSTEM_JOB`) resolving
directly to `ALL` scope without a permissions-table lookup — everything else
goes through the real grant resolution.

`FORCE ROW LEVEL SECURITY` is deliberately **not** set — it would also
restrict `app_migrator` (the table owner, used by migrations and
`prisma/seed.ts`), breaking seeding. The protection boundary is "only
migration/seed tooling ever holds the `app_migrator` credential," enforced by
secrets handling, not SQL.

## Audit trail

Every compliance-relevant table has a generic `AFTER INSERT/UPDATE/DELETE`
trigger (`packages/db/prisma/triggers/002_audit_chain_triggers.sql`) writing
to `audit_log` — deliberately DB-level, not solely an application
interceptor, so a future module can never forget to instrument a new
mutation path. `audit_log` itself is hash-chained by a `BEFORE INSERT`
trigger computing `sha256(prev_hash + canonical_payload)` **in Postgres**
(not app code — one implementation eliminates the "app's JSON serializer
disagrees with the verification tool" false-tamper-positive class of bug),
partitioned into 8 concurrency lanes via `pg_advisory_xact_lock`, with
periodic checkpoints anchoring all lanes. The table is structurally
append-only: no UPDATE/DELETE RLS policy exists, and `UPDATE`/`DELETE`/
`TRUNCATE` privileges are explicitly revoked from `app_runtime` — verified by
attempting exactly that tamper (see the Phase 0 verification log; it fails
with `permission denied`).

Two junction/config tables (`role_permissions`, `user_roles` — composite PK,
no `id` column; `org_settings` — PK is `key`, not `id`) are excluded from the
generic trigger, since it assumes `NEW.id`/`OLD.id` exist. Role/permission
grant changes should be recorded as an explicit `PERMISSION_CHANGE` event via
`AuditService.recordEvent()` at the point of grant/revoke instead.

## What's real vs. what's a documented stub in this Phase 1 build

Real, tested against a live Postgres instance: the full schema, RLS policies
(verified: no-context queries return 0 rows; department-scoped users see
department-owned records; tampering with `audit_log` fails), the hash chain
(verified: independent hash recomputation matches stored hashes for every
row), and the RLS-aware Prisma client (verified under concurrent mixed-
context requests).

Explicitly stubbed with a clear extension point, not silently faked: the
`ai-gateway` module returns `501 Not Implemented` rather than a fake summary;
the `HealthController`'s `/ready` check covers Postgres only, with Redis/MinIO
indicators as a documented extension point rather than an always-true stub.

See `docs/roadmap-phase2-3.md` for what's deliberately out of scope entirely
(Claims, Complaints, Campaigns, full BI, predictive ML) rather than stubbed.
