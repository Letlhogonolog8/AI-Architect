# AEGISDRIVE API — multi-stage production image.
#
# Built from the repository root so the workspace packages resolve:
#   docker build -f apps/api/Dockerfile .

# ---------------------------------------------------------------- base
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Pinned, not floating: bare `corepack enable` resolves pnpm at build time, so
# the image silently followed pnpm to 11 while CI stayed on 10 — a different
# package manager than the one the lockfile (lockfileVersion 9.0) was written
# by. Keep this in step with `version:` in .github/workflows/*.yml.
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /repo

# ------------------------------------------------------------ dependencies
# Manifests are copied before sources so a code-only change reuses the
# install layer instead of re-resolving the whole workspace.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @aegisdrive/api...

# ------------------------------------------------------------------ build
FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
# The referenced workspace libraries are composite TypeScript projects, so
# their .d.ts must be emitted before this app can typecheck against them —
# otherwise every import fails with TS6305 rather than a real type error.
# Local runs hide this by leaving packages/*/dist behind from an earlier build.
# Scoped to this app's own `references`, not the root `typecheck:libs`, which
# also builds lib/* projects that are deliberately not part of this image.
RUN pnpm --filter @aegisdrive/api run db:generate \
 && pnpm exec tsc --build packages/types packages/shared \
 && pnpm --filter @aegisdrive/api run typecheck \
 && pnpm --filter @aegisdrive/api run build

# Collect Prisma's runtime into one plain directory for the production stage.
#
# pnpm keeps every package in a virtual store and links it into place, so
# `apps/api/node_modules/@prisma/client` is a symlink and the generated client
# lands beside it inside the store — there is no `apps/api/node_modules/.prisma`
# to copy, and COPY cannot follow a symlink out of its source tree anyway.
# Resolving the link here and dereferencing with `cp -RL` yields a
# self-contained tree that the production stage takes verbatim.
RUN CLIENT_DIR="$(readlink -f apps/api/node_modules/@prisma/client)" \
 && STORE_MODULES="$(dirname "$(dirname "$CLIENT_DIR")")" \
 && mkdir -p /export/node_modules \
 && cp -RL "$STORE_MODULES/@prisma" /export/node_modules/@prisma \
 && cp -RL "$STORE_MODULES/.prisma" /export/node_modules/.prisma

# ------------------------------------------------------------- production
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# The bundle carries the application and its JS dependencies; Prisma's client
# and query engine stay external and are copied from the build stage.
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /export/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./package.json

# Never run as root. The node image ships an unprivileged `node` user.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
