# PostgreSQL in production

## Indexing: already done

`apps/api/prisma/schema.prisma` already carries `@@index`/`@@unique` on every
hot-path filter — tenant + status/severity for `Incident`, tenant + time for
`Telemetry` and `AuditLog`, tenant + status for every module under
`ThreatDecision`, `SosActivation`, `RecoveryCase`, and so on. There was
nothing missing here worth adding; the schema was already built with the
query patterns in mind. The rest of this document is about the parts that
only show up under production load, not schema design.

## Connection pooling

### Why this matters more than it looks like it should

`apps/api/src/db/prisma.ts` builds one Prisma client per process, and Prisma
opens its own connection pool per client. `k8s/overlays/production`'s API HPA
scales to `maxReplicas: 20` (`resources-patch.yaml`), and every worker adds
its own pool on top. Even a conservative Prisma pool of 5 connections per
process means **100+ connections at the API's ceiling alone**, before the
three workers — and a `db.t3.medium`-class managed Postgres instance often
caps `max_connections` around 100. Scaling the API is supposed to relieve
load, not exhaust the database it depends on.

### First choice: the managed provider's own pooler

If the target is a managed Postgres, use its native pooler before reaching
for anything self-hosted:

- **AWS RDS/Aurora** → RDS Proxy. Notably, RDS does not grant even a
  superuser-equivalent role access to `pg_shadow`, which is what a
  self-hosted PgBouncer's `auth_query` needs (see below) — RDS Proxy sidesteps
  the whole question by handling authentication itself.
- **Google Cloud SQL** → built-in connection pooling (or the Cloud SQL Auth
  Proxy in front of it).
- **Aiven / many others** → a managed PgBouncer add-on.

### Fallback: self-hosted PgBouncer

`infra/docker/pgbouncer/pgbouncer.ini` is a transaction-pooling PgBouncer
config for when the provider has none of the above (or Postgres is
self-hosted entirely). Three things about it that are easy to get wrong:

1. **`auth_query`, not `userlist.txt`.** A static `userlist.txt` holding a
   copy of the database password's hash goes stale the moment that password
   rotates, silently, until someone notices connections failing. Instead,
   `pgbouncer.ini` delegates the password check back to Postgres itself via
   `auth_query`, backed by the `SECURITY DEFINER` function in
   `infra/docker/pgbouncer/generate-auth-function.sql`. Run that SQL once,
   by hand, against the real database — it is deliberately **not** part of
   `apps/api/prisma/migrations`, because it needs privileges the
   application's own migration role should never have (see the file's
   comments on why this only works self-hosted, not against RDS).
2. **Transaction pooling breaks Prisma's prepared statements.** Prisma
   prepares statements per-session by default; a connection that gets handed
   to a different client mid-session (which is the entire point of
   transaction pooling) would see the wrong prepared statement. The fix is
   one query parameter — `DATABASE_URL` must carry `pgbouncer=true` — already
   reflected in `k8s/base/secret.example.yaml`'s example connection string. A
   `DATABASE_URL` pointed at PgBouncer without this parameter will fail in
   ways that look like intermittent, unrelated query errors.
3. **PgBouncer itself needs redundancy.** `k8s/base/pgbouncer.example.yaml`
   runs two replicas — one PgBouncer instance between every application
   replica and Postgres is a new single point of failure otherwise.

### Sizing worksheet

Before changing either ceiling, recompute:

```
(API maxReplicas × Prisma pool size)
  + (notifications-worker replicas × pool size)
  + (telemetry-worker replicas × pool size)
  + (evidence-worker replicas × pool size)
  <= PgBouncer's default_pool_size × PgBouncer replicas
  <= Postgres's max_connections, with headroom for psql/migrations/monitoring
```

Prisma's own pool size is set via `DATABASE_URL`'s `connection_limit` query
parameter (see `k8s/base/secret.example.yaml`) — with PgBouncer in front,
this can stay small (5–10) per process, since PgBouncer is what actually
multiplexes onto the real Postgres connections, not Prisma.

## Slow query monitoring

`db/prisma.ts` now logs any query at or above 200ms **in every environment**,
not just development — it previously only ran outside production, which
meant the one environment where a slow query is an actual incident had no
signal for it at all. It logs at `warn` in production (visible at the
platform's default `LOG_LEVEL=info`) and `debug` elsewhere, and increments
`aegisdrive_api_db_slow_queries_total` (`src/observability/metrics.ts`), which
feeds the `ApiHighLatencyP95` alert in
`infra/monitoring/prometheus/alerts.yml`.

## Autovacuum on high-churn tables

`Telemetry` is, by the retention worker's own estimate
(`services/telemetry/src/index.ts`), ingesting roughly 8.6 million rows a day
for a 500-vehicle fleet — and then deleting a comparable number past the
retention cutoff. Both the constant insert volume and the batched deletes
(`sweepBatch` in that same file) generate dead tuples fast enough that the
default autovacuum thresholds, tuned for a much quieter table, fall behind.
Once there is real production volume to tune against, lower the scale factor
so autovacuum triggers more often on this table specifically rather than
globally:

```sql
ALTER TABLE "Telemetry" SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE "Telemetry" SET (autovacuum_analyze_scale_factor = 0.05);
```

`AuditLog` is next in line for the same treatment if export/compliance
queries against it start showing up in the slow-query log above — it is
append-only and never deleted, so its dead-tuple growth is slower, but its
size only grows.

## Partitioning — a real option, not yet taken

Time-based partitioning of `Telemetry` (monthly, on `recordedAt`) would turn
the retention worker's bounded-batch `DELETE` loop
(`services/telemetry/src/index.ts`'s whole reason for existing, per that
file's own comment) into a single `DROP TABLE` on the oldest partition —
orders of magnitude cheaper, and it stops competing with ingest for locks
entirely. This is not implemented here because Prisma has no first-class
support for declarative partitioning; adding it means hand-written SQL
migrations alongside (not instead of) the Prisma schema, and doing that
against a live, ingesting table without a real production-scale rehearsal
environment to validate the migration against is a bigger risk than this
phase should take on speculatively. Recorded here as the next step once
`Telemetry`'s row count or the retention worker's own sweep duration
justifies it — not before.

## Read replicas

Not configured. `dashboard.service.ts` and similar read-heavy aggregate
queries are already behind the `cached()` read-through cache
(`docs/redis-production.md`), which absorbs the repeat-read load a replica
would otherwise exist to serve. Revisit if cache hit rate data (once
Prometheus has been running long enough to show it) says otherwise.
