# AEGISDRIVE web client — static build served by nginx.
#
#   docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Pinned, not floating: bare `corepack enable` resolves pnpm at build time, so
# the image silently followed pnpm to 11 while CI stayed on 10 — a different
# package manager than the one the lockfile (lockfileVersion 9.0) was written
# by. Keep this in step with `version:` in .github/workflows/*.yml.
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @aegisdrive/web...

FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
# VITE_* values are inlined into the bundle at build time, so a change to any of
# them requires a rebuild, not a restart.
ARG VITE_API_BASE_URL=""
ARG VITE_REALTIME_URL=""
ARG VITE_MAPBOX_TOKEN=""
ARG VITE_APP_ENVIRONMENT=production
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_REALTIME_URL=$VITE_REALTIME_URL \
    VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_APP_ENVIRONMENT=$VITE_APP_ENVIRONMENT
# See apps/api/Dockerfile: the referenced workspace libraries must be emitted
# before this app can typecheck against them. Web also uses packages/ui.
RUN pnpm exec tsc --build packages/types packages/shared packages/ui \
 && pnpm --filter @aegisdrive/web run typecheck \
 && pnpm --filter @aegisdrive/web run build

# 1.31, not 1.27: the older tag sits on Alpine 3.21, which Trivy flags for 35
# HIGH/CRITICAL OS advisories. 1.31 is Alpine 3.24 and currently scans clean.
FROM nginx:1.31-alpine AS production
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Listens on 8080 so the container can run as an unprivileged user — binding
# 80 would require CAP_NET_BIND_SERVICE.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
