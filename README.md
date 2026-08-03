# AEGISDRIVE AI™

**Vehicle Protection Operating System.**

An enterprise platform that continuously understands people, vehicles,
behaviour, environments and threats in order to predict, detect, prevent,
respond to and recover from vehicle hijackings.

Not a tracking app. Not a fleet dashboard.

---

## Status

This repository contains the **architecture and foundation**, not a finished
product. What that means concretely:

**Built and verified**

- Multi-tenant data model — 15 entities, 20 enumerations, tenant-scoped indexes
- Full REST API — 15 domain modules, controller / service / repository /
  validation / routes throughout
- JWT authentication with rotating single-use refresh sessions and replay
  detection
- RBAC across six roles, enforced per route and audited on denial
- Realtime layer — Socket.IO, organization-scoped rooms, Redis adapter for
  multi-replica broadcast
- Web control room — React 19, every route, RBAC guards, live alert rail
- Design system — dark, glass, holographic-blue, domain-aware tokens
- Background workers — notifications, telemetry retention, evidence integrity
- Docker images, compose stack, GitHub Actions CI

**Architected, deliberately not built**

- Mapbox rendering ([ADR-0004](docs/adr/0004-mapbox-deferred.md))
- AI models — the gateway returns 501 rather than a fabricated score
- Object-store integration for evidence media
- Mobile screens ([ADR-0003](docs/adr/0003-mobile-standalone.md))

There is **no synthetic data anywhere** — no seeded fleet, no demo incidents, no
placeholder risk scores. In a product where an operator dispatches armed
responders based on what the screen says, fabricated data is worse than an empty
screen. See [ADR-0005](docs/adr/0005-no-synthetic-data.md).

---

## Layout

```
apps/
  web/         React 19 · Vite · Tailwind v4 · React Query · Zustand · Framer Motion
  api/         Node · Express 5 · Prisma · PostgreSQL · Redis · Socket.IO
  mobile/      Expo · React Native — architecture only, outside the workspace

packages/
  types/       Zero-dependency domain types, enums and wire contracts
  shared/      RBAC policy, constants, validation, isomorphic utilities
  ui/          Design system: theme tokens and domain-aware primitives

services/
  ai/          Python · FastAPI · ONNX — inference gateway
  notifications/  Multi-channel delivery with retry and backoff
  evidence/    Checksum verification, sealing, retention
  telemetry/   Stream aggregation and hot-storage retention

infra/docker/  Compose stack and the shared worker image
docs/          Architecture, ADRs, API reference, runbook
```

`artifacts/` and `lib/` are the previous Replit prototype. They still build and
are scheduled for removal — see [ADR-0001](docs/adr/0001-monorepo-structure.md).

---

## Quick start

```bash
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Generate two DIFFERENT secrets into apps/api/.env:
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET

pnpm --filter @aegisdrive/api run db:generate
pnpm --filter @aegisdrive/api run db:migrate
pnpm --filter @aegisdrive/api run db:seed

pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:5173
```

Full detail, including failure modes, is in [docs/runbook.md](docs/runbook.md).

---

## Verification

```bash
pnpm run typecheck    # every package, app and worker
pnpm run build
pnpm run format:check
```

`db:generate` must have run at least once — the API and both Node workers
typecheck against the generated Prisma client.

---

## The decisions worth knowing before you change anything

**The API is the only authorisation boundary.** Route guards and hidden buttons
in the web client are UX. Every rule is enforced again server-side against data
the client cannot influence.

**Tenancy is enforced in the repository layer.** Every repository function takes
`organizationId` first and puts it in the `where`. Updates use `updateMany` with
a compound `where`, never `update` on an id alone, so a leaked identifier from
another tenant matches zero rows.

**Three tables are append-only.** `audit_logs`, `evidence_custody_events` and
`incident_timeline_entries` have no update or delete path anywhere in the
codebase. An editable audit trail is not an audit trail.

**Automated decisions must be attributable.** Every threat event carries a
versioned `modelId` (`tailing-v3`, never `tailing`) and a confidence. Enforced
by schema regex on both the Python and TypeScript sides.

**Enum values are load-bearing.** The strings in
`packages/types/src/enums.ts` must stay byte-identical to
`apps/api/prisma/schema.prisma`. Change both in the same commit.

---

## Documentation

| | |
| --- | --- |
| [Architecture overview](docs/architecture/overview.md) | How it fits together |
| [Data model](docs/architecture/data-model.md) | Entities and their invariants |
| [RBAC](docs/architecture/rbac.md) | Roles, permissions, revocation |
| [Evidence custody](docs/architecture/evidence-chain-of-custody.md) | Admissibility |
| [API reference](docs/api.md) | Every endpoint and its permission |
| [Runbook](docs/runbook.md) | Setup, deploy, debug |
| [ADRs](docs/README.md#architecture-decision-records) | Why, and what it cost |
