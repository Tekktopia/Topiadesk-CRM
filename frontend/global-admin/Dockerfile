# =============================================================================
# TopiaDesk Global Admin — frontend/global-admin (Next.js 15 App Router).
#
# Same standalone-output, pnpm-workspace multi-stage pattern as
# frontend/web/Dockerfile — see that file's header comment for the full
# reasoning. This app has no dependency on @topiadesk/shared-types (only
# @topiadesk/ui), so that package.json copy is omitted.
# =============================================================================

FROM node:20.19.6-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/global-admin/package.json frontend/global-admin/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @topiadesk/global-admin build

FROM node:20.19.6-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN groupadd --system --gid 1001 topiadesk \
    && useradd --system --uid 1001 --gid topiadesk --create-home topiadesk

COPY --from=builder --chown=topiadesk:topiadesk /app/frontend/global-admin/.next/standalone ./
COPY --from=builder --chown=topiadesk:topiadesk /app/frontend/global-admin/.next/static ./frontend/global-admin/.next/static
COPY --from=builder --chown=topiadesk:topiadesk /app/frontend/global-admin/public ./frontend/global-admin/public

USER topiadesk
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "frontend/global-admin/server.js"]
