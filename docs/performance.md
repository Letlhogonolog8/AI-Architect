# Performance

Most of the platform's performance-relevant decisions live with the feature
they belong to (indexing with the schema, caching with the module that reads
it); this document is where they are indexed, plus the handful of additions
that are genuinely cross-cutting infrastructure rather than a single
feature's concern.

## Already in place

| Lever                       | Where                                                                                                                   | Note                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Indexing                    | `apps/api/prisma/schema.prisma`                                                                                         | Every hot-path filter already covered — see `docs/postgres-optimization.md`'s opening section                                              |
| Read-through caching        | `apps/api/src/cache/redis.ts`'s `cached()`, used by `dashboard.service.ts`, `recovery.service.ts`, `auth.repository.ts` | Fails through to the source on a cache miss or Redis error, never fails the request                                                        |
| Bounded batch deletes       | `services/telemetry/src/index.ts`                                                                                       | Yields between batches rather than holding a long lock that would stall ingest — see that file's own comment                               |
| Frontend code splitting     | `apps/web/vite.config.ts`'s `manualChunks`                                                                              | The map/charting and animation layers are not in the login screen's critical path                                                          |
| Backend bundling            | `apps/api/build.mjs`                                                                                                    | esbuild, minified, single file — Prisma kept external since its query engine binary resolves relative to `node_modules/.prisma` at runtime |
| No N+1 query patterns found | Every `apps/api/src/modules/*/*.service.ts`                                                                             | Checked as part of this phase — nothing to fix                                                                                             |

## Added this phase

- **Response compression** (`compression()` in `apps/api/src/app.ts`).
  Telemetry batches and dashboard payloads are large, repetitive JSON; gzip's
  CPU cost is negligible against the bandwidth and client-side parse time it
  saves.
- **Prometheus request-duration histogram**
  (`apps/api/src/observability/metrics.ts`,
  `aegisdrive_api_http_request_duration_seconds`) — without this, "is it
  actually faster" after any of the other changes here is a guess. See
  `infra/monitoring/grafana/dashboards/aegisdrive-api.json`'s p50/p95/p99
  panel.
- **Always-on slow-query logging** (`apps/api/src/db/prisma.ts`) — previously
  disabled in production, the one environment a slow query actually matters
  in. See `docs/postgres-optimization.md`.
- **Connection pooling** (PgBouncer, `infra/docker/pgbouncer/`) — the API's
  own horizontal scaling (below) is what makes this necessary: more replicas
  means more connections, and Postgres's `max_connections` does not scale
  with the HPA. See `docs/postgres-optimization.md`'s sizing worksheet.
- **Horizontal autoscaling**
  (`k8s/base/api-hpa.yaml`, `k8s/overlays/production/resources-patch.yaml`) —
  CPU- and memory-based, 70%/80% targets, scale-up immediate and scale-down
  debounced 5 minutes (telemetry ingest is bursty; see that file's own
  comment on why flapping is worse than a slightly late scale-down).
- **`keepAliveTimeout`/`headersTimeout` tuning** (`apps/api/src/index.ts`).
  Node's 5-second default `keepAliveTimeout` is shorter than nginx-ingress's
  default 60-second upstream keepalive — under load, that mismatch is exactly
  the setup that produces intermittent `ECONNRESET`/502s, because the ingress
  reuses a pooled connection to a pod that Node has already half-closed.
  Raised to 90s/95s (headers timeout must exceed the keep-alive timeout —
  Node enforces this) to stay comfortably above the ingress side.

## Deliberately not done

- **Read replicas.** `docs/postgres-optimization.md`'s own section on this:
  the read-through cache already absorbs the repeat-read load a replica would
  exist to serve. Revisit with real cache hit-rate data, not preemptively.
- **Table partitioning for `Telemetry`.** A real, sized win — see
  `docs/postgres-optimization.md` — deliberately deferred rather than shipped
  as a speculative, unrehearsed migration against a table that size.
- **CDN / edge caching for the web bundle.** Nothing in this repo runs a CDN
  today; `apps/web/nginx.conf`'s own `Cache-Control` headers (immutable
  hashed assets, never-cache `index.html`) are what a CDN would sit in front
  of, unchanged, whenever one is added — no code here needs to change for
  that to happen.
