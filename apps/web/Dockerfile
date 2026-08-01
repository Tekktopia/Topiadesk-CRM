# =============================================================================
# TopiaDesk CRM — apps/web (Next.js 15 App Router) image.
#
# STATUS: apps/web/package.json exists (Next.js 15 / React 19 / Tailwind /
# @topiadesk/ui + @topiadesk/shared-types workspace deps are declared), but
# the actual app (app/, next.config.ts, etc.) had not landed yet as of this
# infra pass — that's a separate, later workstream. This Dockerfile follows
# the standard Next.js multi-stage "standalone output" pattern so it is
# ready the moment that lands; `docker compose build web` will fail until
# then with a normal "no such file" on `next build`'s output, not because
# of anything wrong in this file. See the root README's build-order note.
#
# REQUIRES apps/web/next.config.{ts,js} to set `output: 'standalone'` —
# without it, `.next/standalone/server.js` (this image's runtime entry
# point) is never produced. Also add `@topiadesk/ui` and
# `@topiadesk/shared-types` to `transpilePackages` in that same config —
# both ship raw TS/TSX source with no build step of their own (see
# packages/ui/package.json's description), which Next's own bundler
# handles natively via that option; no tsx-preload workaround is needed
# here the way apps/api's Dockerfile needs one (Next bundles its
# dependencies at build time; NestJS's tsc-based `nest build` does not).
#
# Build context is the repo root (see apps/api/Dockerfile for the pnpm
# workspace reasoning).
# =============================================================================

FROM node:20.19.6-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
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

COPY --from=builder --chown=topiadesk:topiadesk /app/apps/web/public ./public
COPY --from=builder --chown=topiadesk:topiadesk /app/apps/web/.next/standalone ./
COPY --from=builder --chown=topiadesk:topiadesk /app/apps/web/.next/static ./apps/web/.next/static

USER topiadesk
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# Next.js standalone output places the server entrypoint at the traced
# workspace-relative path — for a monorepo build that's
# apps/web/server.js relative to .next/standalone's root, which was
# copied to `.` above.
CMD ["node", "apps/web/server.js"]
