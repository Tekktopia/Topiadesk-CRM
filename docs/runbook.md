# TopiaDesk CRM — Operations Runbook

## Local development

```bash
cp .env.example .env        # fill in every change_me_* value — see "Secrets" below
docker compose up -d
docker compose logs -f migrate   # watch migration + RLS/trigger apply + seed complete
```

Once `migrate` exits 0, `api` and `worker` start automatically
(`depends_on: condition: service_completed_successfully`). Default demo
logins are in `infra/keycloak/README.md` — all require a forced password
reset (and TOTP setup for `admin`/`compliance`) on first login.

## Secrets management

Every credential in `.env.example` is a placeholder (`change_me_*`). For
anything beyond local dev:
- Never commit a real `.env`.
- Minimum bar: Docker secrets, or a SOPS-encrypted env file decrypted at
  deploy time — not plaintext `.env` on a server, which would undercut the
  NDPR/ISO 27001 alignment the BRD requires.
- Rotate `POSTGRES_MIGRATOR_PASSWORD` / `POSTGRES_RUNTIME_PASSWORD` /
  `KEYCLOAK_CLIENT_SECRET_API` / `ANTHROPIC_API_KEY` independently of each
  other — a leak of one should not require rotating all.

## Production TLS & edge protection

Local dev serves every `*.topiadesk.localhost` host off Traefik's built-in
self-signed cert — no action needed, browsers just show an untrusted-cert
warning. For a real deployment:

1. Point real DNS (`app.<domain>`, `api.<domain>`, your `KEYCLOAK_HOSTNAME`,
   `platform.<domain>`) at this host's public IP. Port 80 must be reachable
   from the internet (Let's Encrypt's HTTP-01 challenge hits it directly).
2. Set `TRAEFIK_ACME_EMAIL` in `.env` to a real, monitored address.
3. Start the stack with the TLS overlay:
   `docker compose -f docker-compose.yml -f docker-compose.prod-tls.yml up -d`
   — see that file's header comment for exactly what it changes and why
   `web-tenant` (the wildcard per-tenant-subdomain router) is deliberately
   excluded (HTTP-01 can't issue wildcard certs; that needs a DNS-01
   challenge with a provider-specific plugin — a decision tied to whichever
   DNS provider actually hosts the domain, not something generic here).
4. Certs persist in the `traefik_acme` volume and auto-renew — no further
   action needed after first issuance.

Edge-level flood protection (`rate-limit` middleware,
`infra/traefik/dynamic/dynamic.yml` — 50 req/s average, burst 100, per
source IP) is already active in every environment, dev included, alongside
the existing `secure-headers` middleware. It's a coarser, IP-based
complement to `backend/api`'s own per-authenticated-user `ThrottlerGuard`
(300 req/60s), not a replacement for a real WAF/DDoS service (Cloudflare,
AWS WAF/Shield, etc.) in front of the host — provider choice there is a
deployment decision, but this gives real protection against a naive flood
either way.

## Postgres role model (why there are two app roles)

- `app_migrator` — owns the schema, runs `prisma migrate deploy`,
  `apply-sql.ts` (RLS policies, audit trigger), and `prisma/seed.ts`.
  **Bypasses RLS by virtue of table ownership** (deliberate — see
  `packages/db/prisma/rls/001_enable_rls.sql`'s header comment for why
  `FORCE ROW LEVEL SECURITY` is intentionally not used).
- `app_runtime` — what `api`/`worker` connect as. `NOBYPASSRLS`, not the
  table owner, DML-only (`ALTER DEFAULT PRIVILEGES` in
  `infra/postgres/init/` grants it `SELECT/INSERT/UPDATE/DELETE` on every
  table `app_migrator` creates — new tables need no manual re-grant).
  Additionally has `UPDATE/DELETE/TRUNCATE` explicitly revoked on
  `audit_log` specifically (append-only enforcement).

**If you need to run ad hoc admin SQL**, connect as `app_migrator` via
`DIRECT_URL` — connecting as `app_runtime` will silently RLS-filter
whatever you're looking at, which reads as "the data is missing" when it
isn't.

## Backup & disaster recovery

Target: RTO < 2 hours, RPO < 30 minutes (BRD NFR).

- **Mechanism**: continuous WAL archiving (`archive_timeout=300s` — forces a
  segment flush at least every 5 minutes even on a quiet system, which is
  what actually bounds RPO; without it a mostly-idle system can silently
  exceed 30 minutes) to the `topiadesk-backups` MinIO bucket, plus periodic
  `pg_dump` base backups via the `backup` Compose service
  (`BACKUP_CRON_SCHEDULE`, default every 6 hours).
- **Failure domain**: MinIO must run on genuinely separate storage/host from
  Postgres in any real deployment — co-locating them defeats the point of
  the backup existing. The local Compose setup does not enforce this (both
  run on one Docker host) — this is a documented Phase 1 local-dev
  limitation, not a production posture.
- **Restore drill** (run this quarterly, not just when something breaks):
  1. Provision a fresh Postgres instance.
  2. Restore the latest `pg_dump` base backup.
  3. Replay WAL segments from the MinIO bucket up to the desired point in
     time.
  4. Run `pnpm --filter @topiadesk/db apply-sql` (RLS policies + audit
     trigger are NOT part of a `pg_dump` of data — well, they are part of
     schema dump if you dump schema+data together; if you restored a
     data-only dump, you must re-apply the RLS/trigger SQL).
  5. Verify: `SELECT create_audit_checkpoint();` then compare the returned
     `anchor_hash` against the last checkpoint before the incident that
     triggered the restore — a mismatch means the restore point is before
     data you needed, not that anything is corrupt.

## Audit trail verification

The hash chain is only meaningful if something actually checks it. Run
(or have the worker's scheduled job run) a full re-walk periodically:

```sql
SELECT count(*) AS mismatches FROM (
  SELECT id, current_hash,
    encode(digest(
      COALESCE(prev_hash,'') || jsonb_build_object(
        'id', id, 'entity_type', entity_type, 'entity_id', entity_id, 'action', action,
        'actor_user_id', actor_user_id, 'actor_system_job', actor_system_job, 'actor_ip', actor_ip,
        'changed_fields', changed_fields, 'chain_lane', chain_lane, 'created_at', created_at
      )::text, 'sha256'), 'hex') AS recomputed
  FROM audit_log
) x WHERE current_hash <> recomputed;
```

A non-zero result means either genuine tampering (treat as a security
incident — escalate immediately, do not attempt to "fix" the row) or a bug
in a change to the trigger's payload-building logic (check recent changes to
`packages/db/prisma/triggers/001_audit_chain_function.sql` first — a field
added to the payload without updating both the trigger AND this
verification query produces false positives).

## Liveness vs. readiness (why they're different endpoints)

`GET /health` — process is up, nothing else. Used for container restart
decisions. **Never add a DB check here** — a brief Postgres blip would then
kill every API replica simultaneously, turning a transient blip into a full
outage.

`GET /ready` — checks Postgres connectivity. Used for load-balancer traffic
routing (a not-ready pod stops receiving new requests but isn't killed).
Extend this (not `/health`) when adding Redis/MinIO checks.

## Troubleshooting

**Login (or anything hitting Keycloak) 500s with `getaddrinfo ENOTFOUND
auth.<domain>` in `web`/`api` logs.** `*.topiadesk.localhost` only resolves
via host-machine/browser DNS (Chromium special-cases `.localhost`; macOS/some
resolvers do too) — Docker Compose's embedded DNS has no idea what it is, so
a container trying to reach it directly fails. `api`/`web` both need to talk
to Keycloak by service name (`http://keycloak:8080`) instead, while still
treating the public URL as the logical issuer (it's what's baked into every
token's `iss` claim, and what the user's browser must be redirected to).
`KEYCLOAK_INTERNAL_URL` in `.env` is that internal address — `jwt-verifier.ts`
swaps just the origin of the JWKS fetch, and `lib/auth/oidc.ts` does the same
for OIDC discovery/token-exchange via `openid-client`'s `customFetch` (kept
separate from the URL used for issuer validation, which stays public). Unset
in a real deployment where public DNS resolves everywhere — both fall back to
the public URL directly. Follow this exact pattern for any future
integration that's reachable at a `*.topiadesk.localhost` hostname.

**A service is unexpectedly missing DB/Redis connectivity after
`docker compose up -d <specific-service>`** (e.g. `/ready` fails with `Can't
reach database server at pgbouncer:6432`, but `pgbouncer` itself is healthy).
Observed repeatedly (both `api` and `web`, on separate occasions): a
container recreation attaches only one of its two declared networks
(`topiadesk_public` but not `topiadesk_data`), even though `docker compose
config` correctly resolves both — a Compose/Docker Desktop reconciliation
glitch, not a config error. Naming individual services (`docker compose up -d
api`) seems to make it more likely, but it has also happened on a full
`docker compose up -d` with no service named — that's a mitigation, not a
guarantee. Fix: `docker network connect topiadesk_data <container>`
(immediate, no restart needed). After any rebuild/restart of `api` or `web`,
check `docker inspect <container> --format
'{{json .NetworkSettings.Networks}}'` against the service's `networks:` list
in `docker-compose.yml` — don't just trust the container's "healthy" status,
since `/health`/`/ready` can pass while a sibling-service dependency (Redis,
pgbouncer) is silently unreachable if it isn't checked by that healthcheck.

## Known Phase 1 limitations (accepted, not oversights)

- **Keycloak is single-instance.** Full HA (Infinispan/JGroups clustering)
  is real complexity deferred past Phase 1. JWKS is cached client-side
  (`jwks-rsa`, `cache: true`), so a brief Keycloak restart doesn't fail
  validation of already-issued tokens — new logins would fail until it's
  back. Acceptable for Phase 1; revisit before a true 99.9% SLA commitment
  at higher scale.
- **Document RLS is coarse by design**: any authenticated user can read any
  document (see `packages/db/prisma/rls/002_policies.sql`'s comment on
  `documents_select`) — cascading document ACLs through every possible
  linked entity's ownership was assessed as Phase 2/3-caliber complexity,
  not a Phase 1 gap.
- **The `backup` service's WAL archiving is the documented mechanism**, not
  a fully automated point-in-time-recovery tool with a one-command restore
  — the drill above is manual on purpose until real production load
  patterns justify automating it.
