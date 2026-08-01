# Keycloak realm bootstrap

`realm-export.json` seeds the `topiadesk` realm on first boot via Keycloak's
`--import-realm` flag, mounted at
`/opt/keycloak/data/import/realm-export.json` in the container.

## Why the user IDs are hardcoded

The four demo users' `id` fields (`11111111-...`, `22222222-...`,
`33333333-...`, `44444444-...`) are **not arbitrary** — they exactly match
`KC.admin` / `KC.manager` / `KC.broker` / `KC.compliance` in
`packages/db/prisma/seed.ts`. TopiaDesk's own `User` table links to Keycloak
via `keycloakSubjectId`, which is populated from the JWT's `sub` claim at
login time (see `backend/api/src/common/auth/rls-context.middleware.ts`) — for
the seeded local Postgres users to resolve to a real Keycloak identity, the
Keycloak-side user ID must equal the Postgres-side `keycloakSubjectId`. If
you add more seed users later, keep both files in sync.

## Why Keycloak realm roles look redundant with Postgres roles

They're deliberately independent. TopiaDesk's actual RBAC (permission
scopes, RLS enforcement) lives entirely in Postgres
(`users`/`roles`/`permissions`/`role_permissions` — see
`packages/db/prisma/rls/002_policies.sql`), looked up by
`keycloakSubjectId`, not from the JWT's `realm_access.roles` claim. The
realm roles here exist for Keycloak-admin-console clarity and as a future
hook (e.g. if we ever gate Keycloak's own admin console), not because the
API reads them.

## MFA

`CONFIGURE_TOTP` is set as a required action on the `admin` and
`compliance` demo users, approximating the
`security.mfa_required_roles = ['ADMIN', 'COMPLIANCE_OFFICER']`
`org_settings` row seeded in Postgres. Keycloak has no realm-level
"require MFA for role X" toggle — this is enforced per-user (or via a
Conditional OTP authentication flow for a real per-role policy, which is a
reasonable Phase-2 hardening step once real users replace these demo
accounts).

## Client secret

`topiadesk-api`'s secret is `${env.KEYCLOAK_CLIENT_SECRET_API}` — Keycloak's
own env-var substitution syntax for realm import files, resolved from the
container's environment (`KEYCLOAK_CLIENT_SECRET_API` in `.env`), not a
literal to edit here.

## Demo credentials

All four demo users have `temporary: true` passwords (`ChangeMe!<Role>1`)
forcing a password reset on first login. These are local-dev fixtures only —
never reuse this realm export as-is for a real deployment; rotate every
credential.
