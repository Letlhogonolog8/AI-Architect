# @aegisdrive/types

Zero-dependency, framework-agnostic type layer. Everything in this package must
be consumable by the API (Node), the web app (browser), the mobile app (Hermes)
and the background services without pulling in a runtime.

## Rules

1. **No runtime dependencies.** The only permitted runtime values are frozen
   const objects (the enum pattern) and pure helper literals.
2. **No Prisma imports.** Prisma models leak `Date`, `Decimal` and nullable
   relation shapes that clients must never see. The read models in
   `src/domain.ts` are the wire contract; the API maps Prisma → these.
3. **Enum values are load-bearing.** The string values in `src/enums.ts` must
   stay identical to the enums in `apps/api/prisma/schema.prisma`. A mismatch is
   a silent data bug, so change both in the same commit.

## Layout

| File          | Contents                                                |
| ------------- | ------------------------------------------------------- |
| `common.ts`   | Primitives, geo, pagination, `ApiResponse` envelope     |
| `enums.ts`    | Every domain enumeration plus ordered ladders           |
| `auth.ts`     | Permission union, token claims, login/refresh contracts |
| `domain.ts`   | API read models for each aggregate                      |
| `realtime.ts` | Socket.IO event maps and room helpers                   |
