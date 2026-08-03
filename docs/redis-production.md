# Redis in production

## What Redis actually holds here

Worth stating up front because it drives every decision below: **nothing in
Redis is this platform's source of truth.**

| Use                             | Where implemented                                                                                     | Durable elsewhere?                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Rate limit counters             | `apps/api/src/middleware/rate-limit.middleware.ts`                                                    | No — and doesn't need to be; a fixed window resets naturally |
| Cached auth principal           | `apps/api/src/modules/auth/auth.repository.ts` (`cached`/`invalidate`, `apps/api/src/cache/redis.ts`) | Yes — refetched from PostgreSQL on a miss                    |
| Dashboard/recovery read caches  | `apps/api/src/modules/dashboard/dashboard.service.ts`, `.../recovery/recovery.service.ts`             | Yes — same pattern, PostgreSQL is authoritative              |
| Socket.IO cross-replica adapter | `apps/api/src/realtime/socket-server.ts` (`@socket.io/redis-adapter`)                                 | N/A — pub/sub, nothing to persist                            |

Sessions and refresh tokens live in PostgreSQL's `Session` table, not Redis —
see `docs/runbook.md`'s deployment order. **This means a Redis data loss event
is a cache-cold-start, not an incident**: every read-through cache in
`cache/redis.ts` falls through to its loader on a miss or an error (see
`cached()`'s own comment), and `rateLimit()` fails open (see that file's
comment). There is deliberately no backup or restore procedure for Redis in
`docs/backup-restore.md` — there is nothing in it worth restoring.

## Connection security

`apps/api/src/cache/redis.ts` constructs every client directly from
`REDIS_URL` — `new Redis(env.REDIS_URL, { ... })`. ioredis parses the scheme
itself, so both of these work with **no code change**:

```
redis://host:6379              # plaintext, password optional in the URL
rediss://:password@host:6379   # TLS in transit + AUTH, scheme is `rediss`
```

Production must use `rediss://`. `k8s/base/secret.example.yaml` documents this
as the expected shape of the real `REDIS_URL` secret value. If your managed
Redis (ElastiCache, Memorystore, Upstash, Aiven) fronts connections with a
certificate not in the default trust store, ioredis's TLS options accept a CA
bundle — that would be the one place `redis.ts` would need a small extension
(a `REDIS_TLS_CA` env var read into `tls: { ca: ... }`), not implemented here
because no deployment target in this repo currently needs it.

## Eviction and persistence

`infra/docker/docker-compose.yml`'s local Redis runs:

```
--appendonly yes --maxmemory-policy noeviction
```

Carry both into production, whether self-hosted or as the managed service's
equivalent parameter group setting:

- **`noeviction`, not an LRU policy.** Under memory pressure, `noeviction`
  makes Redis reject writes with an error rather than silently dropping a
  random key. Combined with the fail-open/fail-through handling above, a
  rejected write degrades to "rate limiter waves this request through" or
  "cache miss, read from Postgres" — both safe, both logged. An eviction
  policy would do the same degrading silently, which is strictly worse for
  noticing that Redis is undersized before it becomes a real problem.
- **AOF (`appendonly yes`).** Cheap insurance against restart-induced cache
  stampedes at higher traffic — without it, a Redis restart means every
  cached principal and every dashboard read misses at once. Not required for
  correctness (see above), just for avoiding a self-inflicted thundering herd.

## High availability

**Recommended: a managed Redis with Multi-AZ / cross-zone replication**
(ElastiCache Multi-AZ, Memorystore Standard tier, Upstash, Aiven) — the same
call made for PostgreSQL in `k8s/README.md`, and for the same reason: a
database's failover and patching should not be coupled to this application's
own deploys and node drains.

**Self-hosted alternative:** Redis Sentinel (three sentinels, one primary,
one or more replicas) is the standard self-hosted HA topology. This repo's
`redis.ts` connects to a single endpoint via `REDIS_URL` and does not
currently construct a Sentinel-aware client — ioredis supports this directly
(`new Redis({ sentinels: [...], name: 'mymaster', password })`), but wiring it
in is deliberately left undone here rather than shipped untested: it would
mean a second, parallel connection-construction path with no self-hosted
Sentinel cluster anywhere in this repo's Docker Compose or Kubernetes
manifests to test it against. If you are standing up self-hosted Sentinel,
that is the extension point.

## Network access

`k8s/base/networkpolicy.yaml`'s `allow-egress-to-datastores` policy is what
actually lets the API and every worker reach Redis on port 6379 — see that
file and `k8s/README.md`.

## Secret rotation

Rotating the Redis password (or reissuing a TLS cert) invalidates every
existing connection at the next reconnect — `redis.ts`'s `retryStrategy`
already handles a connection drop by retrying, so a rolling rotation (update
the secret, then roll the API and workers so each replica picks up the new
value from its environment) needs no code change. There is no equivalent of
the JWT secret rotation's "every session is now invalid" blast radius
(`docs/runbook.md`'s security-incident section) — rotating Redis credentials
only affects this platform's own connections to it, never an end user's
session, since sessions are not stored there.
