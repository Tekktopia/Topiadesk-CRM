# =============================================================================
# TopiaDesk CRM — backend/api (NestJS) image.
#
# Build context is the REPO ROOT (docker-compose.yml sets `context: .`,
# `dockerfile: backend/api/Dockerfile`) — required because this is a pnpm
# workspace: the api package depends on @topiadesk/db, @topiadesk/config,
# @topiadesk/shared-types by workspace reference, so every workspace
# package.json (and, ultimately, source) must be visible in the build
# context, not just backend/api/.
#
# This same Dockerfile also backs the one-off `migrate` init container
# (docker-compose.yml: `build.target: build`) — it needs the exact same
# installed workspace (packages/db's Prisma CLI, tsx, schema, RLS/trigger
# SQL) to run `pnpm --filter @topiadesk/db migrate:deploy` /
# `... seed` before api/worker are allowed to start, so reusing the
# `build` stage directly avoids a second, drifting Dockerfile.
#
# Two load-bearing, non-obvious fixes baked into the final stage — read
# before changing:
#
# 1. backend/api/package.json declares `"type": "module"` but its
#    tsconfig.json compiles to CommonJS (`"module": "CommonJS"`, matching
#    nest-cli.json's default tsc-based build). Node picks the module
#    system from the nearest package.json's `"type"` field, so
#    `node dist/main.js` would be parsed as ESM despite containing
#    `require(...)`/`module.exports` — a ReferenceError at boot. Neither
#    file is ours to edit (backend/api/src/**, backend/api/package.json are
#    other workstreams' territory), so this is fixed at the image layer:
#    a `dist/package.json` with `{"type":"commonjs"}` is written after
#    build, which Node resolves BEFORE walking up to the parent
#    package.json.
#
# 2. @topiadesk/db, @topiadesk/config and @topiadesk/shared-types have no
#    build step of their own (package.json "main" points straight at
#    "./src/index.ts") — intentional in this monorepo (packages/db's own
#    npm scripts already run seed.ts/apply-sql.ts via `tsx`, not `tsc`
#    output). That means requiring them from compiled backend/api code is a
#    require() of a raw .ts file, which plain Node cannot execute. Fixed
#    by preloading tsx's CommonJS require-hook (`-r tsx/cjs`) so any
#    require() that hits a .ts file gets transpiled on the fly. This is
#    NOT used for backend/api's own code (which stays fully tsc-compiled by
#    `nest build`, required for NestJS's `emitDecoratorMetadata`-based DI
#    to work — esbuild/tsx does not support that transform, so backend/api
#    itself cannot simply run under tsx alone) — only for the small,
#    decorator-free workspace dependency packages. Since tsx is a
#    devDependency of packages/db (not hoisted to root under pnpm's
#    default strict linking, and not something this Dockerfile may add to
#    backend/api/package.json), its exact install path is resolved at
#    container start via Node's own `require.resolve`, not hardcoded.
# =============================================================================

FROM node:20.19.6-bookworm-slim AS base
# Prisma's schema/query engine binaries need OpenSSL to load — bookworm-slim
# ships none by default, which surfaces as a *silent* "Schema engine error:"
# with no further detail (not a clear "missing library" message), and
# separately as a real, non-cosmetic runtime failure for the query engine
# backend/api uses on every request, not just at `prisma migrate deploy` time.
# Caught in Phase 0 verification: `docker compose up` on a truly clean image
# without this reproduces the empty error exactly. Required in EVERY stage
# that touches Prisma (deps/build below AND the separate `runtime` stage —
# Docker multi-stage builds do not carry apt-installed packages across a
# fresh `FROM`).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --- deps: install once, cached across builds as long as manifests/lockfile
# don't change ---------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/api/package.json backend/api/package.json
COPY backend/worker/package.json backend/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/db-platform/package.json packages/db-platform/package.json
COPY packages/config/package.json packages/config/package.json
# packages/automation — the shared automation core (entity registry,
# condition engine, action catalog, cron helpers). backend/api and
# backend/worker both depend on it and have no import path between their
# own src/ trees, which is why it is a workspace package rather than
# duplicated code; it must be listed here like every other manifest or
# pnpm install cannot resolve the workspace dependency.
COPY packages/automation/package.json packages/automation/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/reports/package.json packages/reports/package.json
# frontend/web and packages/ui are intentionally omitted here — backend/api
# doesn't depend on either, and `pnpm install --frozen-lockfile` below only
# needs manifests for packages actually in this build's dependency graph.
# packages/reports WAS omitted on that same reasoning until
# backend/api/package.json picked up a "@topiadesk/reports": "workspace:*"
# dependency (reports/scheduled-reports controllers) — without its
# manifest here, `pnpm install --frozen-lockfile` below never links
# packages/reports' own deps (zod/pdfkit/exceljs/@aws-sdk/*), so `nest
# build`'s type-check of the full dependency graph in the `build` stage
# below fails with "Cannot find module" from inside packages/reports/src,
# not from anything backend/api itself changed.
RUN pnpm install --frozen-lockfile

# Vendor the local embedding model's weights into the image at build time —
# see local-embeddings.service.ts's header comment. Runs BEFORE `COPY . .`
# below so it's cached by Docker layer caching independent of unrelated
# source changes (same caching philosophy `pnpm install` above already
# uses), and downloads once here rather than on every container start or
# first request. /app/.model-cache is a literal path that MUST match
# MODEL_CACHE_DIR in local-embeddings.service.ts exactly — there is no
# shared constant between this Dockerfile and that TypeScript file, so if
# one changes, the other must too.
RUN cd backend/api && node -e "\
  const { pipeline } = require('@huggingface/transformers'); \
  pipeline('feature-extraction', 'onnx-community/all-MiniLM-L6-v2-ONNX', { dtype: 'fp32', cache_dir: '/app/.model-cache' }) \
    .then(() => { console.log('embedding model cached'); process.exit(0); }) \
    .catch((err) => { console.error('Failed to cache embedding model:', err); process.exit(1); });"

# A second model-vendoring step for the local conversational fallback's
# generative model (local-llm.service.ts) used to live here
# (onnx-community/Qwen2.5-1.5B-Instruct, q8) — removed: that generic
# pretrained model was reported live as making the system slow, and
# LocalLlmService is no longer registered in AiGatewayModule (see that
# module's own comment). See the approved plan
# (distributed-kindling-cupcake.md, Track 2) for the parallel effort to
# train a smaller, domain-fine-tuned replacement — if/when that ships, a
# similar RUN step vendoring the NEW model belongs back here.

# --- build: full source, generate Prisma client, compile backend/api ----------
FROM deps AS build
COPY . .
# dotenv-cli (wrapped by packages/db's migrate:deploy/seed/apply-sql
# scripts, e.g. `dotenv -e ../../.env -- prisma migrate deploy`) errors if
# the file it's pointed at doesn't exist. Docker Compose already injects
# every POSTGRES_*/etc. value as real process env vars (via `environment:`
# from .env), so an EMPTY placeholder satisfies dotenv-cli's file-exists
# check without ever containing a secret — dotenv's own load semantics
# never override an already-set process env var, so this contributes
# nothing and changes no value.
RUN touch .env
RUN pnpm --filter @topiadesk/db generate
RUN pnpm --filter @topiadesk/db-platform generate
RUN pnpm --filter @topiadesk/api build
RUN printf '{"type":"commonjs"}' > backend/api/dist/package.json

# --- runtime: same base, only what's needed to run --------------------------
FROM node:20.19.6-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# See the `base` stage's comment above — required again here, this is a
# fresh FROM. The query engine runs on every request api serves, not just
# at migration time.
#
# fontconfig + fonts-dejavu-core: `canvas` (chartjs-node-canvas's rendering
# backend, used by to-chart-image.ts) fetches a prebuilt native binary via
# prebuild-install at `pnpm install` time — confirmed empirically it needs
# NO apt packages at all to install or render. Without a font package,
# though, it renders with a "Fontconfig error: Cannot load default config
# file" warning and falls back to some default — verified live this still
# produces a valid PNG, but with no confirmed-decent text rendering for
# chart titles/labels/legends, which matters here since every generated
# chart has visible text. Installing these two removes the warning and
# gives Chart.js a real font to render with.
RUN apt-get update && apt-get install -y --no-install-recommends openssl fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 topiadesk \
    && useradd --system --uid 1001 --gid topiadesk --create-home topiadesk

# See fix #2 above: full node_modules (not a pruned --prod install) is kept
# so every workspace package's raw-TS entrypoint remains requirable via the
# tsx preload below. Known, documented trade-off vs. a fully pruned image —
# revisit once packages/db|config|shared-types gain real `tsc` build steps
# with "main" pointed at dist/, which would let a pruned `pnpm deploy`
# runtime work instead.
COPY --from=build --chown=topiadesk:topiadesk /app /app

# A real committed file (backend/api/docker-entrypoint.sh), not generated
# inline via printf — see that file's header comment for why: an earlier
# printf+hex-escape version broke because /bin/sh (dash, what actually runs
# Dockerfile RUN instructions) doesn't interpret \x27 the way bash's printf
# does, producing literal `\x27` text and a Node SyntaxError at boot.
COPY backend/api/docker-entrypoint.sh /usr/local/bin/topiadesk-api-entrypoint.sh
RUN chmod 0755 /usr/local/bin/topiadesk-api-entrypoint.sh

USER topiadesk
EXPOSE 4000

# Right-sized back down now that only one model (the embedding model)
# loads at boot — the generative LLM's own load no longer happens at all
# (see the removed vendoring step above). Measured ~1.7s cold for the
# embedding model alone once local_files_only actually applies correctly
# (see local-embeddings.service.ts's header comment on the NODE_ENV bug
# that used to make this silently attempt a network fetch instead) —
# 60s/6 retries leaves generous margin over that without reintroducing the
# multi-minute grace period two models used to need.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.API_PORT||4000,path:'/ready'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["/usr/local/bin/topiadesk-api-entrypoint.sh"]
