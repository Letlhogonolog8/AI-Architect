# Runbook

## First-time setup

```bash
pnpm install

# Datastores
docker compose -f infra/docker/docker-compose.yml up -d

# Environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Generate two different secrets and paste them into apps/api/.env
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET

# Schema and RBAC roles
pnpm --filter @aegisdrive/api run db:generate
pnpm --filter @aegisdrive/api run db:migrate
pnpm --filter @aegisdrive/api run db:seed
```

Set `SEED_ADMIN_PASSWORD` in `apps/api/.env` before seeding if you want a
bootstrap administrator; without it the seed reconciles roles only.

## Running

```bash
pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:5173

pnpm --filter @aegisdrive/telemetry-service run dev
pnpm --filter @aegisdrive/notifications-service run dev
pnpm --filter @aegisdrive/evidence-service run dev
```

The web dev server proxies `/api` and `/realtime` to the API, so the browser
sees one origin and the refresh cookie stays first-party.

### Running the stack in containers instead

`docker compose ... up -d` starts postgres and redis alone and needs no
configuration. Running the API and workers in containers as well needs the two
JWT secrets, and Compose reads them from `infra/docker/.env` — its env file
resolves against the directory holding the compose file, not the directory you
run the command from, so a `.env` at the repository root is not read:

```bash
cp infra/docker/.env.example infra/docker/.env   # then fill in both secrets
docker compose -f infra/docker/docker-compose.yml --profile full up -d
```

Leaving them unset does not fail the `up`; the api container exits immediately
with the config report described below, because `src/config/env.ts` is the
enforcement point.

## Verification

```bash
pnpm run typecheck      # every package and app
pnpm run format:check
pnpm run build
```

`db:generate` must have run at least once, or the API and both workers fail to
typecheck against a missing Prisma client.

## Health probes

| Endpoint        | Meaning                                          |
| --------------- | ------------------------------------------------ |
| `/health/live`  | Process is running. Never touches a dependency.  |
| `/health/ready` | 200 healthy · 503 degraded. Checks DB and Redis. |

The database is load-bearing: unreachable means `degraded` and 503, and the load
balancer should pull the replica. Redis being down costs caching and rate
limiting but not correctness, so the replica stays healthy — the dependency
status in the body makes the degradation visible.

## Common failures

### "Cannot find module '@prisma/client'" across the API and workers

The client has not been generated.

```bash
pnpm --filter @aegisdrive/api run db:generate
```

### API exits immediately with a config report

`src/config/env.ts` rejected the environment. The report on stderr names each
offending variable. In production the two JWT secrets must differ and
`CORS_ORIGINS` must not contain `*`.

### Operators are logged out unpredictably

Refresh tokens are single-use. If the client fires several requests that all
401 at once and each triggers its own refresh, the second rotation presents an
already-revoked token, which the API correctly treats as replay and destroys
every session for that user.

`apps/web/src/lib/api-client.ts` shares a single in-flight refresh across
concurrent 401s. If this recurs, look for a second HTTP client that bypasses it.

### Realtime shows "Offline" but the API is up

Check in order:

1. `REDIS_URL` — the Socket.IO adapter needs Redis and multi-replica broadcast
   silently reaches only one process without it.
2. The token used at handshake. Reconnect attempts re-read the current token;
   a stale one fails the handshake without an obvious error.
3. `CORS_ORIGINS` — the Socket.IO handshake is origin-checked too.

### Rate limiting appears to have stopped working

It fails open by design: if Redis is unreachable the limiter logs a warning and
allows the request. Losing the cache degrades protection, not availability.
Check Redis.

## Deployment order

1. `db:deploy` — migrations, applied before new code runs.
2. `db:seed` — reconciles RBAC roles; idempotent and safe in production.
3. Roll the API.
4. Roll the workers.
5. Publish the web bundle.

Migrations must be backwards-compatible with the currently deployed API, since
both run simultaneously during a rolling deploy.

`.github/workflows/release.yml` automates exactly this order for both staging
(on every merge to `main`) and production (on a version tag) — see
`docs/deployment.md` for the full pipeline, required secrets, and the one
placeholder every deployment target must replace before it will push or pull
any image.

## Security incident: suspected credential compromise

```bash
# Kill every session for one user
POST /api/v1/users/:userId/reset-password    # revokes all sessions

# Or suspend the account outright
POST /api/v1/users/:userId/status  { "status": "SUSPENDED" }
```

Suspending revokes every session immediately and invalidates the cached
principal. Then read the audit trail:

```
GET /api/v1/audit-logs?actorUserId=<id>
GET /api/v1/audit-logs?action=PERMISSION_DENIED
GET /api/v1/audit-logs?action=EXPORT
```

Rotating `JWT_ACCESS_SECRET` invalidates every access token platform-wide;
rotating `JWT_REFRESH_SECRET` invalidates every session. Rotate both on a
confirmed server-side compromise.
