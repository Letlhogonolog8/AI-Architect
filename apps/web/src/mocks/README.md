# src/mocks — the simulated world

Everything in this directory is **fabricated**. It exists so the command centre
can be built, reviewed and demonstrated before the AI services, the device fleet
and the responder integrations exist.

This is a deliberate, scoped exception to
[ADR-0005 (no synthetic data)](../../../../docs/adr/0005-no-synthetic-data.md).
The rule that ADR protects — _an operator must never act on a fabricated
number_ — is upheld by containment, not by absence.

## How containment works

```
widgets  →  useXQuery()  →  dataSource  ─┬─→  MockDataSource   (this directory)
                                          └─→  LiveDataSource  (the REST API)

widgets  →  store        →  realtimeDriver ─┬─→ SimulatedDriver (this directory)
                                             └─→ SocketIoDriver (the API socket)
```

Four properties make the boundary hold:

1. **No widget imports from `mocks/`.** They import `dataSource` and the store.
   The only module that names both implementations is `src/data/index.ts`.

2. **The mock cannot run in production.** `resolveDataSource()` _throws_ when
   `VITE_DATA_SOURCE=mock` in a production build. Not a warning, not a
   fallback — a hard boot failure. A demo flag that can be switched on in
   production is how a control room ends up dispatching against invented
   positions.

3. **The simulation speaks the real wire contract.** `SimulatedDriver` emits
   `ServerToClientEvents` payloads from `@aegisdrive/types`. Change the
   protocol and this directory fails to compile — the mock cannot silently
   drift from the real protocol, which is what makes most mock layers
   worthless.

4. **The UI says so.** The command centre header renders an unmissable
   `SIMULATION` badge whenever `dataSource.kind === 'mock'`.

## Switching to real data

```bash
# apps/web/.env
VITE_DATA_SOURCE=live
```

No widget changes. `LiveDataSource` already implements the full interface; the
endpoints it still needs throw `NotImplementedOnApiError` naming the exact route
to build. It deliberately does **not** return `[]` for a missing endpoint — an
empty responder list reads as "no police nearby", which is a materially
different and more dangerous statement than "we never asked".

## What is in here

| File             | Purpose                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `random.ts`      | Seeded PRNG (mulberry32). Fixtures are reproducible across reloads and tabs                                      |
| `geography.ts`   | Real Johannesburg coordinates, haversine, polyline maths                                                         |
| `fixtures.ts`    | One-time world generation: vehicles, corridors, responders, hotspots, cameras, incidents, evidence, AI decisions |
| `simulation.ts`  | The mutable world. Ticks vehicles along corridors, drifts risk, churns detections, emits events                  |
| `mock-source.ts` | `CommandCentreClient` over the simulation, with artificial latency                                               |

## Two details worth knowing

**Seeded, not random.** `Math.random()` would give different fixtures on each
of React Strict Mode's two renders, in each tab, and between a screenshot and
the bug report describing it. The seed is fixed, so vehicle `AB 12 CD GP` is
the same vehicle for everyone.

**Latency is intentional.** `mock-source.ts` delays every response by 90–320 ms.
Without it, loading skeletons, disabled submit states and races between two
queries never execute in development, and break the first time the app meets a
real network.

## Deleting this directory

When every endpoint in `CommandCentreDataSource` is live:

1. Delete `src/mocks/`.
2. Delete `src/realtime/simulated-driver.ts`.
3. Collapse `src/data/index.ts` to `export const dataSource = new LiveDataSource()`.
4. Remove `dataSource` from `src/config/env.ts` and `VITE_DATA_SOURCE` from the
   env templates.

Nothing else refers to any of it.
