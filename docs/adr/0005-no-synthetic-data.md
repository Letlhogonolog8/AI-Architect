# ADR-0005: No synthetic data, anywhere

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

A new platform with empty tables demos badly. The reflex is to seed a plausible
fleet, a handful of incidents and some telemetry so screens look alive.

## Decision

The platform ships no fabricated operational data. Specifically:

- `prisma/seed.ts` creates the six RBAC roles and, outside production, one
  bootstrap organisation and administrator. **No vehicles, drivers, incidents,
  evidence, alerts or telemetry.**
- `services/ai` returns **501** for risk scoring rather than a heuristic score.
- `TacticalMapPlaceholder` says the map is not integrated instead of drawing
  invented pins.
- Unbuilt screens use `PlaceholderPage`, which lists planned capabilities and
  the endpoint backing each — not fake table rows.
- `services/evidence` **throws** in `computeStoredChecksum` rather than
  returning a placeholder digest.

## Rationale

This is a system where people act on what the screen says. An operator
dispatches armed responders. A prosecutor relies on an evidence checksum. A
fleet manager decides a driver is unsafe.

Fabricated data in a product like this creates three specific failures:

1. **It trains misplaced trust.** Someone who has watched a risk gauge move for
   weeks in a demo believes it when it is wired to a real model — including on
   the day the model is broken.
2. **It hides emptiness that matters.** A dashboard reading "0 vehicles under
   threat" because nothing is connected looks identical to one reading zero
   because the fleet is safe. An honest empty state distinguishes them.
3. **It survives longer than intended.** Seed data has a way of reaching a
   staging environment that a customer is shown, and then a production database
   nobody wants to be the one to clear.

The specific case that decided this: `computeStoredChecksum` returning a
placeholder. Any placeholder either marks every artefact `CORRUPTED`, or — if
made to match — marks a genuinely corrupt artefact clean. There is no safe fake
value for that function, and the same is true, less obviously, of a fake risk
score.

## Consequences

**Fresh installs look empty**, because they are. Every list screen has a
deliberate empty state explaining what will appear and why it has not yet.

**Demos need real data.** Register vehicles and post telemetry through the API,
which exercises the actual ingest path — a better demo, and it tests something.

**Load testing needs a separate generator.** It belongs in a test fixture that
cannot run against a non-test database, not in the seed.

## Alternatives considered

**Seed behind a `--demo` flag.** Rejected: flags get set in environments they
were never meant for, and the data outlives the reason it was created.

**Seed only in development.** This is what the bootstrap _tenant_ does, and it
is the right shape for a credential. Rejected for operational data because the
demo-becomes-staging-becomes-production path starts in development.
