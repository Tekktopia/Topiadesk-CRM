# =============================================================================
# TopiaDesk CRM — frontend/web (Next.js 15 App Router) image.
#
# Standard Next.js multi-stage "standalone output" pattern, adapted for a
# pnpm workspace monorepo build (see the COPY paths below — the standalone
# server entrypoint lands at frontend/web/server.js relative to the traced
# output root, matching this repo's actual directory layout).
#
# REQUIRES frontend/web/next.config.{ts,js} to set `output: 'standalone'` —
# without it, `.next/standalone/server.js` (this image's runtime entry
# point) is never produced. Also add `@topiadesk/ui` and
# `@topiadesk/shared-types` to `transpilePackages` in that same config —
# both ship raw TS/TSX source with no build step of their own (see
# packages/ui/package.json's description), which Next's own bundler
# handles natively via that option; no tsx-preload workaround is needed
# here the way backend/api's Dockerfile needs one (Next bundles its
# dependencies at build time; NestJS's tsc-based `nest build` does not).
#
# Build context is the repo root (see backend/api/Dockerfile for the pnpm
# workspace reasoning).
# =============================================================================

FROM node:20.19.6-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/web/package.json frontend/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
# packages/automation — the shared automation core (entity registry,
# condition engine, action catalog, cron helpers). backend/api and
# backend/worker both depend on it and have no import path between their
# own src/ trees, which is why it is a workspace package rather than
# duplicated code; it must be listed here like every other manifest or
# pnpm install cannot resolve the workspace dependency.
COPY packages/automation/package.json packages/automation/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @topiadesk/web build

FROM node:20.19.6-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN groupadd --system --gid 1001 topiadesk \
    && useradd --system --uid 1001 --gid topiadesk --create-home topiadesk

COPY --from=builder --chown=topiadesk:topiadesk /app/frontend/web/.next/standalone ./
COPY --from=builder --chown=topiadesk:topiadesk /app/frontend/web/.next/static ./frontend/web/.next/static
# Must land next to server.js (frontend/web/server.js), not at the
# container's top-level ./public — Next's standalone server resolves
# public/ relative to its own location, the same way it resolves
# .next/static above. Was pointed at the wrong path: static assets under
# public/ (e.g. logo-mark.png) 404'd at runtime despite the file being
# present in the image, just at a path the server never looks at.
COPY --from=builder --chown=topiadesk:topiadesk /app/frontend/web/public ./frontend/web/public

USER topiadesk
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# Next.js standalone output places the server entrypoint at the traced
# workspace-relative path — for a monorepo build that's
# frontend/web/server.js relative to .next/standalone's root, which was
# copied to `.` above.
CMD ["node", "frontend/web/server.js"]
