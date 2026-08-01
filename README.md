# TopiaDesk CRM

An enterprise CRM built for Scib Nigeria (insurance brokerage), designed to
outperform Freshdesk/Zendesk for large-organization use — see
[`docs/architecture.md`](docs/architecture.md) for the full technical
rationale and [`docs/roadmap-phase2-3.md`](docs/roadmap-phase2-3.md) for
what's intentionally not built yet.

## Stack

- **Backend**: NestJS (`apps/api`), Prisma + Postgres 16/pgvector with
  row-level security (`packages/db`), BullMQ background jobs (`apps/worker`)
- **Frontend**: Next.js 15 App Router (`apps/web`), shadcn/ui design system
  (`packages/ui`)
- **Auth**: self-hosted Keycloak (OIDC/SSO/MFA)
- **Infra**: Docker Compose — Postgres, PgBouncer, Redis, MinIO, Keycloak,
  Traefik, Prometheus/Grafana/Loki (see `infra/` and `docker-compose.yml`)

## Getting started

```bash
cp .env.example .env      # fill in secrets — see docs/runbook.md
docker compose up -d
docker compose logs -f migrate   # wait for this to exit 0, then api/worker start automatically
```

`docker compose up` picks up `docker-compose.override.yml` automatically —
it layers local-dev conveniences (direct host-port access to
Postgres/Redis/MinIO/Grafana/Prometheus, the Traefik dashboard when
`TRAEFIK_DASHBOARD_ENABLED=true`) on top of `docker-compose.yml`, which is
itself a complete, self-sufficient "prod-like" stack. Run
`docker compose -f docker-compose.yml up -d` instead for a stricter run
with nothing exposed except Traefik's 80/443.

TLS: `*.topiadesk.localhost` is served over HTTPS by Traefik using its own
on-the-fly self-signed certificate (no setup step required) — browsers
will warn about an untrusted cert locally; that's expected. Real Let's
Encrypt certs (`TRAEFIK_ACME_EMAIL`) are documented for a real deployment
in `infra/traefik/traefik.yml`.

Then visit `https://app.topiadesk.localhost` (see `infra/keycloak/README.md`
for demo logins) or the API docs at `https://api.topiadesk.localhost/api/docs`.

| Service          | URL (via Traefik)                        | Notes |
|-------------------|-------------------------------------------|-------|
| Web               | `https://app.topiadesk.localhost`         | |
| API + Swagger     | `https://api.topiadesk.localhost/api/docs`| `/health`, `/ready` |
| Keycloak          | `https://auth.topiadesk.localhost`        | admin console: `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` |
| MinIO console      | `http://localhost:${MINIO_CONSOLE_PORT}`  | dev override only, root creds |
| Grafana            | `http://localhost:3001`                   | dev override only |
| MailDev            | `http://localhost:${MAILDEV_WEB_PORT}`    | dev override only, captures all outbound mail |

## Development

```bash
pnpm install
pnpm dev            # turbo run dev across all apps
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration   # requires a migrated+seeded Postgres — see .github/workflows/ci.yml
```

## Repository layout

See [`docs/architecture.md`](docs/architecture.md#monorepo-layout).

## Operations

See [`docs/runbook.md`](docs/runbook.md) — secrets management, backup/DR,
audit trail verification, and known Phase 1 limitations.
