# AEGISDRIVE API — multi-stage production image.
#
# Built from the repository root so the workspace packages resolve:
#   docker build -f apps/api/Dockerfile .

# ---------------------------------------------------------------- base
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
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
RUN pnpm --filter @aegisdrive/api run db:generate \
 && pnpm --filter @aegisdrive/api run typecheck \
 && pnpm --filter @aegisdrive/api run build

# ------------------------------------------------------------- production
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# The bundle carries the application and its JS dependencies; Prisma's client
# and query engine stay external and are copied from the build stage.
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /repo/apps/api/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /repo/apps/api/package.json ./package.json

# Never run as root. The node image ships an unprivileged `node` user.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
