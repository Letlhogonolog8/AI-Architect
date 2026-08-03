# Architecture overview

AEGISDRIVE AI is a multi-tenant operating system for vehicle protection. It
ingests continuous telemetry, scores risk, raises alerts, opens incidents,
coordinates response and preserves evidence — with an audit trail across all of
it.

## Shape of the system

```
                    ┌──────────────┐   ┌──────────────┐
                    │  apps/web    │   │ apps/mobile  │
                    │ control room │   │   driver     │
                    └──────┬───────┘   └──────┬───────┘
                           │ REST + Socket.IO │
                           └────────┬─────────┘
                                    ▼
                          ┌───────────────────┐
                          │     apps/api      │  ← the only writer to Postgres
                          │  REST · realtime  │     that operators can reach
                          │  RBAC · audit     │
                          └─────┬───────┬─────┘
                                │       │
                 ┌──────────────┘       └──────────────┐
                 ▼                                     ▼
         ┌──────────────┐                      ┌──────────────┐
         │  PostgreSQL  │                      │    Redis     │
         │   (Prisma)   │                      │ cache·pubsub │
         └──────┬───────┘                      └──────┬───────┘
                │                                     │
    ┌───────────┼──────────────┐                      │
    ▼           ▼              ▼                      │
┌────────┐ ┌──────────┐ ┌────────────┐         Socket.IO adapter
│evidence│ │telemetry │ │notification│         (multi-replica fanout)
└────────┘ └──────────┘ └────────────┘
                 ▲
                 │ HTTP + service token
         ┌───────┴────────┐
         │  services/ai   │  Python · ONNX · OpenCV
         └────────────────┘
```

## The load-bearing decisions

### 1. One writer, many readers

`apps/api` is the only process operators talk to and the only one that applies
business rules. The workers read and write their own narrow slices (retention
sweeps, delivery state, integrity flags) but never implement domain logic.
`services/ai` does not touch the database at all — it calls the API's public
endpoints with a service token.

That last constraint is the important one. Every automated decision therefore
passes the same validation, RBAC and audit path a human decision does. A model
that could write straight into Postgres would produce threat events with no
audit entry, and an unaudited automated decision is unusable in an
investigation.

### 2. Tenancy is enforced in the repository layer

Every repository function takes `organizationId` as its first argument and puts
it in the `where` clause. Updates and deletes use `updateMany`/`deleteMany` with
a compound `where` rather than `update`/`delete` keyed on id alone, so a leaked
identifier from another tenant matches zero rows instead of the wrong row.

The principal's `organizationId` always comes from the verified token, never
from a URL or body. There is no tenant-id path parameter anywhere in the API.

### 3. Types flow one way

```
packages/types  ──►  packages/shared  ──►  apps/*  ·  services/*
   (no deps)          (types + zod)
```

`packages/types` has zero runtime dependencies and no Prisma import. Prisma
models leak `Date`, `Decimal` and nullable relation shapes that clients must
never see, so each module maps Prisma rows to the DTOs in `domain.ts` explicitly
— which is also what stops a newly added secret column leaking by being picked
up implicitly.

The enum string values in `packages/types/src/enums.ts` and
`apps/api/prisma/schema.prisma` must stay byte-identical. Change both in the
same commit.

### 4. Realtime is a push channel, not a cache

React Query owns request/response data with cache semantics. The realtime store
owns a push stream where only the newest value matters. Feeding every position
update through the query cache would invalidate and re-render far more than the
one map pin that moved.

Socket.IO rooms are organization-scoped and every broadcast targets a room —
never `io.emit`. The Redis adapter exists because the API runs as N replicas and
a client connected to replica A must receive an incident raised on replica B.

### 5. Append-only where it matters

Three tables have no update or delete path anywhere in the codebase, by design:

| Table                       | Why                                                    |
| --------------------------- | ------------------------------------------------------ |
| `audit_logs`                | An editable audit trail is not an audit trail          |
| `evidence_custody_events`   | A custody chain with a gap is inadmissible             |
| `incident_timeline_entries` | The operational record produced alongside the evidence |

## Request lifecycle

1. `requestContext` establishes the async-local store and correlation id.
2. `pino-http` logs, with credentials and tokens redacted.
3. `securityHeaders` + CORS reject disallowed origins before any work.
4. Body parsing, capped at 2 MB. Media never transits this process.
5. `/health` is mounted **before** the rate limiter so probes are never throttled.
6. `rateLimit` — Redis-backed, fails open if Redis is down.
7. `authenticate` verifies the token and re-reads the principal from the
   database (cached 5 minutes), so a suspension takes effect on the next request
   rather than at token expiry.
8. `requirePermissions` gates on the RBAC matrix and audits denials.
9. `validate` parses and **replaces** `req.body`/`query`/`params`, so handlers
   never see raw input.
10. Controller → service → repository. The controller holds no business rules;
    the repository holds no policy.
11. `errorHandler` is the single exit point. Non-operational errors are logged
    in full and rendered as a bare 500.

## Where to read next

- [`rbac.md`](./rbac.md) — the authorisation model
- [`evidence-chain-of-custody.md`](./evidence-chain-of-custody.md)
- [`../adr/`](../adr/) — why things are the way they are
- [`../runbook.md`](../runbook.md) — operating it
