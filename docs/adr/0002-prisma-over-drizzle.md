# ADR-0002: Prisma as the ORM for the new platform

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

The specification called for Prisma. The existing prototype used Drizzle. Both
are competent; the decision needed a reason beyond "it was specified".

## Decision

Prisma for everything in `apps/api` and `services/*`.

## Rationale

**The schema is the artefact people argue about.** This domain has thirteen
entities and twenty enumerations whose values are load-bearing across four
runtimes. `schema.prisma` is a single declarative file that a security reviewer,
a DBA and a backend engineer can all read. Drizzle's schema is TypeScript,
which is more expressive and much harder to review as a data model.

**Migrations are a first-class, reviewable artefact.** `prisma migrate` produces
checked-in SQL. For a platform that will face compliance review, "show me every
change ever made to the evidence table" needs to be answerable from the
repository.

**Generated types eliminate a category of bug.** `Prisma.VehicleWhereInput` and
friends mean the tenant-scoping pattern (`updateMany` with a compound `where`)
is type-checked rather than conventional.

## Consequences

**The client must be generated before anything typechecks.** `pnpm db:generate`
runs in CI before the typecheck step and in every Dockerfile before the build.
A fresh clone that skips it produces confusing errors across the API and both
workers.

**`@prisma/client` cannot be bundled.** It resolves its query engine binary
relative to `node_modules/.prisma/client` at runtime. Every esbuild config
marks it external and every production image copies `.prisma` and `@prisma` in
from the build stage.

**`BigInt` does not serialise to JSON.** `Evidence.sizeBytes` is `BigInt` in the
database and is narrowed to `number` in the mapper. File sizes stay well inside
`Number.MAX_SAFE_INTEGER`, so this is lossless in practice — but it is a
conversion that has to be done deliberately in every mapper touching a `BigInt`.

**Two ORMs coexist during the transition.** See ADR-0001.

## Alternatives considered

**Drizzle**, for consistency with the prototype. Rejected: the prototype is
scheduled for removal, so consistency with it is a temporary benefit, and the
schema-review argument above is a permanent one.

**Raw SQL with a query builder.** Rejected: thirteen entities with tenant
scoping on every read is exactly the volume of repetitive, easy-to-get-subtly-
wrong code an ORM exists to remove. A missing `organizationId` in a hand-written
`WHERE` is a cross-tenant data leak.
