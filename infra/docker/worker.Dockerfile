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
RUN corepack enable
WORKDIR /repo

FROM base AS deps
ARG SERVICE_NAME
ARG SERVICE_PACKAGE
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY services/${SERVICE_NAME}/package.json services/${SERVICE_NAME}/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "${SERVICE_PACKAGE}..."

FROM deps AS build
ARG SERVICE_NAME
ARG SERVICE_PACKAGE
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
# The workers share the API's Prisma schema; the generated client is the
# contract between them, so it is generated from the one canonical schema.
COPY apps/api/prisma/ apps/api/prisma/
COPY services/${SERVICE_NAME}/ services/${SERVICE_NAME}/
RUN pnpm --filter @aegisdrive/api exec prisma generate --schema apps/api/prisma/schema.prisma \
 && pnpm --filter "${SERVICE_PACKAGE}" run typecheck \
 && pnpm --filter "${SERVICE_PACKAGE}" run build

FROM base AS production
ARG SERVICE_NAME
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /repo/services/${SERVICE_NAME}/dist ./dist
COPY --from=build /repo/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /repo/apps/api/node_modules/@prisma ./node_modules/@prisma

USER node

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
