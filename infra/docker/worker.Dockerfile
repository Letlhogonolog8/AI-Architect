# Shared image for the Node background workers.
#
# One parameterised Dockerfile rather than three near-identical copies: the
# workers differ only in which package is built and run.
#
#   docker build -f infra/docker/worker.Dockerfile \
#     --build-arg SERVICE_NAME=telemetry \
#     --build-arg SERVICE_PACKAGE=@aegisdrive/telemetry-service .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Pinned, not floating: bare `corepack enable` resolves pnpm at build time, so
# the image silently followed pnpm to 11 while CI stayed on 10 — a different
# package manager than the one the lockfile (lockfileVersion 9.0) was written
# by. Keep this in step with `version:` in .github/workflows/*.yml.
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /repo

FROM base AS deps
ARG SERVICE_NAME
ARG SERVICE_PACKAGE
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY services/${SERVICE_NAME}/package.json services/${SERVICE_NAME}/
# @aegisdrive/api is installed alongside the service — not because the worker
# imports it, but because the build step below generates the Prisma client from
# the API's schema and the `prisma` CLI is one of that package's devDependencies.
# Without it the build fails with `Command "prisma" not found`. This is why the
# API manifest is copied above.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "${SERVICE_PACKAGE}..." --filter @aegisdrive/api

FROM deps AS build
ARG SERVICE_NAME
ARG SERVICE_PACKAGE
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
# The workers share the API's Prisma schema; the generated client is the
# contract between them, so it is generated from the one canonical schema.
COPY apps/api/prisma/ apps/api/prisma/
COPY services/${SERVICE_NAME}/ services/${SERVICE_NAME}/
# See apps/api/Dockerfile: the referenced workspace libraries must be emitted
# before this service can typecheck against them.
# Absolute schema path: `--filter ... exec` runs with the cwd set to that
# package's directory, so a repo-relative path would resolve against
# /repo/apps/api and miss.
RUN pnpm --filter @aegisdrive/api exec prisma generate --schema /repo/apps/api/prisma/schema.prisma \
 && pnpm exec tsc --build packages/types packages/shared \
 && pnpm --filter "${SERVICE_PACKAGE}" run typecheck \
 && pnpm --filter "${SERVICE_PACKAGE}" run build

# See apps/api/Dockerfile: pnpm links the generated client out of its virtual
# store, so it has to be resolved and dereferenced rather than copied by path.
RUN CLIENT_DIR="$(readlink -f apps/api/node_modules/@prisma/client)" \
 && STORE_MODULES="$(dirname "$(dirname "$CLIENT_DIR")")" \
 && mkdir -p /export/node_modules \
 && cp -RL "$STORE_MODULES/@prisma" /export/node_modules/@prisma \
 && cp -RL "$STORE_MODULES/.prisma" /export/node_modules/.prisma

FROM base AS production
ARG SERVICE_NAME
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /repo/services/${SERVICE_NAME}/dist ./dist
COPY --from=build /export/node_modules ./node_modules

USER node

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
