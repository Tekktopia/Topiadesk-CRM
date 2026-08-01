#!/bin/sh
# =============================================================================
# apps/api container entrypoint.
#
# @topiadesk/db, @topiadesk/config, @topiadesk/shared-types have no build
# step of their own (package.json "main" points straight at "./src/index.ts")
# — requiring them from apps/api's compiled (tsc) code is a require() of a
# raw .ts file, which plain Node cannot execute. Fixed by preloading tsx's
# CommonJS require-hook so any require() that hits a .ts file gets
# transpiled on the fly. This is NOT used for apps/api's own code (which
# stays fully tsc-compiled by `nest build`, required for NestJS's
# emitDecoratorMetadata-based DI to work) — only for these small,
# decorator-free workspace dependency packages.
#
# tsx is a devDependency of packages/db (not apps/api itself, and not
# hoisted to root under pnpm's default strict linking), so its install path
# is resolved at container start via Node's own require.resolve rather than
# hardcoded — this is a real committed script, not generated inline in the
# Dockerfile via a printf/escaping trick, specifically because an earlier
# attempt at the latter broke: `\x27` hex-escapes for embedding single
# quotes render correctly under bash's printf (verified locally) but not
# under the /bin/sh (dash) that actually runs Dockerfile RUN instructions,
# producing a literal `\x27tsx/cjs\x27` string in the generated file and a
# Node SyntaxError at container start. Caught during Phase 0 docker-compose
# verification — don't reintroduce a generated-inline-script approach
# without testing it inside an actual container build, not just locally.
set -e
TSX_HOOK="$(node -e "console.log(require.resolve('tsx/cjs', { paths: [process.cwd() + '/packages/db'] }))")"
exec node -r "$TSX_HOOK" apps/api/dist/main.js
