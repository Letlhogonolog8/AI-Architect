# ADR-0001: Monorepo structure and the legacy prototype

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

The repository already contained a Replit prototype: a Vite dashboard in
`artifacts/command-center`, an Express server in `artifacts/api-server`, and
shared libraries in `lib/` built on **Drizzle ORM** with an OpenAPI/Orval
codegen pipeline.

AEGISDRIVE AI was specified with a different structure (`apps/`, `packages/`,
`services/`) and a different data layer (**Prisma**).

## Decision

Build the new platform alongside the prototype rather than replacing it in
place.

- New code lives in `apps/`, `packages/`, `services/`, `infra/`, `docs/`.
- The existing `artifacts/` and `lib/` trees are left untouched and remain in
  `pnpm-workspace.yaml`.
- The root `typecheck` and `build` scripts cover both.

## Rationale

The prototype had uncommitted work in it at the time this was written —
`Shell.tsx` and five new UI components in `artifacts/command-center`. Deleting
another engineer's uncommitted work to make room for a greenfield structure is
not a decision an architect gets to make unilaterally, and it is trivially
reversible in the other direction: removing the old tree later is one commit,
recovering deleted uncommitted work is not.

Keeping both also means the new platform had to prove it typechecks and builds
in the same workspace as the old one, which surfaced the pnpm catalog and
platform-override issues immediately rather than at deployment.

## Consequences

**Two ORMs in one repository.** Drizzle in `lib/db`, Prisma in `apps/api`. They
share no code and no database schema. This is tolerable temporarily and is
**not** a pattern to extend — no new package should adopt Drizzle.

**Two design systems.** `artifacts/command-center` has its own shadcn/ui copy;
the new client uses `@aegisdrive/ui`. They do not share tokens.

**Slower CI.** The workspace typechecks both trees.

## When to remove the prototype

Once `apps/web` covers the screens `artifacts/command-center` was reaching for
and its uncommitted work has been either merged or abandoned by its author,
delete `artifacts/` and `lib/`, drop them from `pnpm-workspace.yaml` and the
root `tsconfig.json`, and remove Drizzle from the catalog. That is a single,
reviewable commit — deliberately.

## Alternatives considered

**Replace in place.** Rejected: destroys uncommitted work.

**Separate repository.** Rejected: the shared type layer between web, mobile,
API and workers is the main thing a monorepo buys here, and splitting would mean
publishing `@aegisdrive/types` before there is anything to publish it for.
