# ADR-0003: The mobile app is not a workspace package

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

`apps/mobile` is a React Native Expo project. The obvious move is to add it to
`pnpm-workspace.yaml` so it can import `@aegisdrive/types` and
`@aegisdrive/shared` via `workspace:*`, exactly as the web client does.

## Decision

`apps/mobile` is **excluded** from the pnpm workspace. It has its own lockfile
and its own `node_modules`, and installs with `cd apps/mobile && pnpm install`.

## Rationale

Two problems, both structural rather than incidental:

**1. Version pinning conflicts.** Expo pins exact versions of React, React
Native and roughly forty native modules, and `expo-doctor` treats deviation as
an error. This repository's catalog pins `react: 19.1.0` — note the comment
already in `pnpm-workspace.yaml` saying "must be this exact version because expo
requires it", which is the tail wagging the dog. Every Expo SDK upgrade would
force a synchronised React upgrade across the web client and every package.

**2. Metro does not understand symlinks the way pnpm uses them.** pnpm's
isolated `node_modules` is a tree of symlinks into a content-addressed store.
Metro's resolver and React Native's autolinking both walk `node_modules`
expecting real directories. The workarounds — `node-linker=hoisted`,
`nohoist` shims, custom `metro.config.js` resolver paths — each trade one class
of breakage for another, and they break again on every SDK bump.

The cost of isolation is real but bounded and well understood. The cost of
fighting Metro is unbounded and recurs on every upgrade.

## Consequences

**The mobile app cannot import the shared packages.** `src/types/` holds a local
mirror and `src/theme/tokens.ts` duplicates the palette from
`packages/ui/src/styles/theme.css`. This duplication is the price of the
decision and it is a real one — the enum values are load-bearing across the
whole platform.

**It is excluded from the root `typecheck` and `build`.** CI must run its checks
in a separate job with its own install step.

## Resolving the duplication

In preference order:

1. **Publish `@aegisdrive/types` and `@aegisdrive/shared` to a private
   registry** and depend on them by version. This is the intended end state: it
   removes the duplication without coupling the install graphs at all.
2. **Generate a typed client** from the OpenAPI spec into
   `apps/mobile/src/api/generated`, checked in and regenerated in CI.
3. **Keep the manual mirror** with a CI check that diffs the enum values against
   `packages/types`. Acceptable only as a stopgap.

Option 1 should be taken as soon as there is a private registry to publish to.

## Alternatives considered

**Include it and use `node-linker=hoisted`.** Rejected: hoisting the entire
workspace to satisfy Metro degrades isolation for every other package and
reintroduces phantom-dependency bugs.

**Expo monorepo support via `metro.config.js` `watchFolders`.** This does work
for simple cases. Rejected because it does not solve the version-pinning
conflict, which is the harder of the two problems.
