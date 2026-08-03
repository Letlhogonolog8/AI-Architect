# ADR-0004: Mapbox integration is deferred

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

The tactical map is the centrepiece of a control-room product. The
specification asked for the architecture to be prepared for Mapbox but for the
integration itself to be held back.

## Decision

Everything the map needs exists and is wired. The rendering layer does not.

**Ready:**

- Live positions stream over Socket.IO into `useRealtimeStore.positions`, keyed
  by vehicle id — already the exact shape a marker layer consumes.
- `GET /api/v1/threat-events/zones` returns centre, radius, level and
  active-hour windows, ready to render as circle layers.
- Historical routes via `GET /api/v1/telemetry/vehicles/:vehicleId`.
- `VITE_MAPBOX_TOKEN` is plumbed through `webEnv`.
- `manualChunks` in `vite.config.ts` already splits heavy libraries out of the
  entry chunk.

**Not built:** the `<TacticalMap>` component itself.

## Rationale

**The placeholder is honest, and that is the point.**
`TacticalMapPlaceholder` states plainly that the map is not integrated and shows
the live count of vehicles currently streaming. It does not render a decorative
map with invented pins.

In a hijacking-response product, a fake map is worse than no map. An operator
who believes it is real makes decisions on fiction. The same reasoning drives
`services/ai` returning 501 rather than a heuristic risk score, and the seed
creating no synthetic fleet.

**Deferring costs nothing structurally.** The data contracts the map needs are
the same ones the rest of the product needs. Nothing about adding the render
layer later requires reshaping anything built now.

## Consequences

`/fleet` is a placeholder page until this lands. The dashboard's tactical
overview panel shows the placeholder rather than a map.

## Implementation notes for whoever picks this up

- `mapbox-gl` is ~800 KB gzipped. Lazy-load it; do not put it in the entry chunk.
- Do not put a React component per marker. At 500 vehicles that is 500
  reconciling components on every position update. Use a single GeoJSON source
  and `setData`.
- Position updates arrive at up to 12/minute/vehicle. Throttle `setData` to
  animation frames rather than calling it per event.
- The token is public and ships in the bundle. Restrict it by URL in the Mapbox
  dashboard — that restriction is the only control on it.
