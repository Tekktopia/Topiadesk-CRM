# =============================================================================
# TopiaDesk CRM — backend/worker image.
#
# Build context is the repo root (see backend/api/Dockerfile's header comment
# for why — same pnpm workspace reasoning applies here).
#
# Unlike backend/api, this stays on `tsx` at runtime instead of a `tsc` build:
# backend/worker has no NestJS decorators (nothing here needs
# `emitDecoratorMetadata`, which esbuild/tsx cannot emit), and tsx is
# already a direct devDependency of this package, so it resolves normally
# via backend/worker/node_modules — no dynamic require.resolve trick needed
# like backend/api's Dockerfile requires for its dependency packages.
# =============================================================================

FROM node:20.19.6-bookworm-slim AS base
# See backend/api/Dockerfile's `base` stage comment: Prisma's engine binaries
# need OpenSSL, which bookworm-slim doesn't ship — required in every stage
# that touches @topiadesk/db, including this one's separate `runtime` stage.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/worker/package.json backend/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/config/package.json packages/config/package.json
# packages/reports' own manifest must be present here too — see
# backend/api/Dockerfile's `deps` stage comment for why (same
# --frozen-lockfile dependency-graph reasoning): backend/worker/package.json
# picked up "@topiadesk/reports": "workspace:*" for the scheduled-report
# dispatch/generate-and-deliver jobs, which need the shared report registry.
COPY packages/reports/package.json packages/reports/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN touch .env
RUN pnpm --filter @topiadesk/db generate

FROM node:20.19.6-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Fresh FROM — does not inherit `base`'s openssl/corepack setup (Docker
# multi-stage builds only carry layers forward within the SAME FROM chain).
# openssl: see backend/api/Dockerfile's `base` stage comment (Prisma engine
# needs it). corepack/pnpm: CMD below runs `pnpm ...`, so the binary must
# exist in THIS stage, not just `base` — its absence here previously
# crashed the container with "Cannot find module '/app/pnpm'" (node
# silently trying to require() the literal string as a path when no `pnpm`
# executable is on PATH) — caught during Phase 0 docker-compose verification.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

RUN groupadd --system --gid 1001 topiadesk \
    && useradd --system --uid 1001 --gid topiadesk --create-home topiadesk

COPY --from=build --chown=topiadesk:topiadesk /app /app

USER topiadesk
EXPOSE 9100

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.WORKER_METRICS_PORT||9100,path:'/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["pnpm", "--filter", "@topiadesk/worker", "start"]
