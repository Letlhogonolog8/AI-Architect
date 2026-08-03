# ADR-0011: SafeCorridor — routing without redlining

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

SafeCorridor is the preventive half of the product: route a vehicle along a path
whose risk is understood, rather than reacting after a hijacking. Phase 8 asked
for route optimisation, crime avoidance, traffic prediction, safe destination
selection, police route sharing and dynamic recalculation.

Most of that is ordinary engineering. One part is not, and it decides the shape
of everything else:

**Crime-avoidance routing is redlining unless it is built against that
outcome.**

In South Africa, "high-crime area" maps almost exactly onto apartheid spatial
planning. A router that avoids areas with elevated crime statistics avoids
townships. A fleet running that router gradually stops serving the people who
live in them — not by decision, but by accumulation: those trips get quoted
longer, scheduled later, and eventually declined. "High-risk zone" exclusions
have already produced documented delivery deserts elsewhere, and the residents
experience it as a service they cannot buy.

It is also discriminatory in effect under the Promotion of Equality and
Prevention of Unfair Discrimination Act, whatever the intent behind it.

Drivers are genuinely killed in hijackings, and hotspots are real. So refusing
to build this is not the answer either. The answer is structural constraints
that make the harmful version harder to build than the safe one.

## Decisions

### 1. Hazard attaches to road segments in time windows, never to areas

`SegmentHazard` keys on a segment id and an hour range. There is no suburb
field, no district field, no area type, and nothing in the schema from which one
could be derived and grouped on. There is no query that produces risk-by-area.

**Why:** "the M1 South Corlett offramp between 18:00 and 21:00" is operationally
precise, actionable, and redlines nobody. "Alexandra" is a demographic
statement wearing a geographic label. The two feel similar and are not, and the
difference is entirely in the resolution.

The absence of an area-level aggregate is the control. A "risk by suburb" report
is the artefact that converts segment-level routing back into redlining, because
once it exists somebody will route on it.

### 2. A destination is never avoided

`RoutingPolicy.neverExcludeDestination` is typed as the literal `true`. There is
no `avoidAreas` parameter, no destination blocklist, no `corridor:exclude`
permission, and no endpoint that could mark a place unreachable.

**Why:** risk avoidance is a choice _between ways of reaching a place_. Refusing
to reach it is a different act with a different victim — the person who lives
there and cannot get a delivery. Keeping the two apart in the type system means
the second cannot be reached by tuning the first.

When a provider returns no path, that is reported as a graph failure, explicitly
not as a routing decision.

### 3. Hazard is a rate, and the objective is expected incidents

A hazard is incidents per million vehicle-hours. Route cost is:

```
objective = transitMinutes + λ × Σ(rate_i × hours_i)
```

where λ is **minutes of driving accepted per expected incident avoided**.

**Why, and this is the part that does the safety work:** expected incidents is a
rate times _time on the road_, so a detour accumulates its own exposure. Driving
forty minutes around a bad offramp adds forty minutes of baseline risk, and past
some point the detour is worse than the thing it avoids. The arithmetic refuses
to over-detour without needing a rule to stop it.

A unitless "risk score" has no such property. A router minimising one will
happily send a driver an hour out of their way to reduce a number, leaving them
more exposed, later at night, on roads nobody has data for.

Expressing λ in minutes-per-incident also makes the trade-off an arguable number
rather than a hidden weight. It is recorded on every plan.

### 4. The detour has a bounded allowance, and is counted always

The allowance is

```
min(ceiling, max(ratio × fastestRouteTime, floor))
```

with all three scaling by risk-aversion profile — `STANDARD` is 25%, a
10-minute floor and a 20-minute ceiling; `HIGH` is 60%, 20 and 45. On a
30-minute trip that gives 10 and 20 minutes respectively.

All three terms are needed, and getting the combination wrong is easy. The
first implementation took the _minimum_ of the ratio and the absolute bound,
which made the ratio bind on every short trip: 25% of 30 minutes is 7.5, so the
router rejected a route offering **94% less exposure for eight extra minutes**.
Both bounds looked reasonable in isolation. Only running the numbers exposed it.

Scaling only the ceiling by profile has the same shape of bug — on a short trip
the floor dominates, so a `HIGH` profile with a 45-minute ceiling still
authorises only the 10-minute floor, and short urban trips are exactly where the
hotspots are.

The allowance is a second line of defence for when the hazard data is wrong; the
exposure integral in decision 3 is the first.

**When the allowance blocks a route that would have cut exposure by half or
more, that is reported as an explicit constraint** rather than silently
absorbed. It means the segment needs an intervention routing cannot provide — a
schedule change, an escort, a conversation with the road authority — and the
driver is being sent down the higher-exposure road in the meantime. A router
should not unilaterally add forty-five minutes to a thirty-minute trip; a person
should decide that, and the constraint tells them to.

Every plan writes a `RoutingEquityRecord` — including plans with no detour,
because recording only the expensive trips would understate the denominator.

**Why:** the harm is invisible from inside the system causing it. Each detour
looks reasonable. The pattern only appears in aggregate, and only if someone is
counting. `GET /corridor/equity-report` surfaces destination cells carrying at
least twice the fleet-median detour burden.

The report does **not** auto-correct. The right response might be to relax risk
aversion, add a safe haven, move a depot, or accept the cost explicitly — those
are decisions for people who can weigh them, and a router that quietly
self-adjusted would hide the trade-off instead of surfacing it.

The aggregation cell is a coarse grid reference, roughly 5 km, deliberately not
a suburb name: fine enough to detect a district being underserved, coarse enough
that a cell is a neighbourhood rather than a customer, and without the social
meaning that would invite reading the report as a list of "bad areas".

### 5. The platform's own alerts are never hazard data

`HazardSource` has no `PLATFORM_ALERT` member. Only human-confirmed incidents,
official statistics, partner feeds, road-authority notices and justified manual
assessments.

**Why:** flagging a segment raises monitoring there, which raises detections,
which raises the flag. That loop manufactures the pattern it claims to find, and
it is the central failure of every predictive-policing deployment that has been
audited. Confirmation requires a human precisely so the loop cannot close.

### 6. Reporting bias lowers confidence, never adjusts the rate

`POLICE_STATISTICS` and `PARTNER_FEED` set `reportingBiasPossible` and carry a
0.6 confidence multiplier. Hazards below the confidence floor do not influence
routing at all.

**Why:** reported crime measures reporting and policing intensity as much as
crime, and under-reporting varies enormously by area. A low reported rate can
mean a safe road or a road whose residents do not call the police.

Applying a correction factor would substitute a fabricated number for an honest
admission that the figure is soft — and the size of the bias is unknown and
area-dependent, so any factor would itself encode an assumption about which
areas under-report.

### 7. Police sharing is a grant, never a feed

`PoliceRouteShare` requires an incident (not nullable), has a non-null expiry
capped at twelve hours, is revocable, and counts every access. Expiry,
revocation and incident closure are checked **in the query**, so a lapsed grant
returns nothing rather than returning data a caller must remember to check.

`corridor:share-police` is held by operators and security and deliberately **not**
by the `POLICE` role: the party receiving the visibility must not also be the
party authorising it.

**Why:** continuous location sharing of a worker with law enforcement is
surveillance with an extra step. The driver is an employee doing their job and
most of the time there is nothing to see. The one case that justifies it — a
vehicle being hijacked and officers who might intercept it — always has an
incident attached, which is why the grant requires one.

### 8. Safe havens are refuges, never a service filter

`SafeHaven` describes where to send a vehicle _during_ an incident. Nothing in
the haven code path touches routing eligibility, and the two never share code.

Ranking is dominated by proximity and openness rather than by kind: a police
station twenty minutes away is worse than a staffed, lit, camera-covered fuel
station four minutes away. What ends a hijacking is arriving somewhere public
with witnesses, not somewhere official.

Havens unverified for 180 days are heavily downranked. A driver sent to a
forecourt that closed six months ago arrives somewhere dark believing they are
safe, which is worse than never having been sent.

### 9. Recalculation is gated by hysteresis, and never pushed under coercion

Two-minute minimum interval, three-minute minimum improvement, 250 m off-route
tolerance. Only viability failures — a closed road, a live threat decision —
bypass those.

`mayNotifyDriver` returns false whenever coercion is suspected.

**Why the hysteresis:** a driver re-routed every few seconds stops following the
routing, and a driver ignoring a route they no longer trust is worse off than
one following a slightly stale one.

**Why the coercion rule:** navigation is the one channel that talks to the cabin
by design. A hijacker who sees the route change learns that the control room has
noticed, in front of the driver — the same reasoning as ADR-0008 decision 5,
applied where it would otherwise leak.

## Consequences

**No route can be planned in this build.** `POST /corridor/plans` returns 501.
Turning coordinates into candidate paths needs a road graph, ADR-0004 deferred
the map integration, and that still stands. What is built is everything
downstream: the hazard model, the exposure integral, the objective and its
bounds, haven ranking and coverage, recalculation hysteresis, and equity
accounting. The failure is loud rather than a fabricated straight line.

**The provider contract forbids avoidance.** A provider returns paths and times;
it must not be configured with avoid-polygons. A provider quietly avoiding a
neighbourhood would bypass the detour cap, the equity record and the audit trail
in one move, and would do it invisibly.

**Hazard rates cannot be entered by hand.** `POST /corridor/hazards` takes a
count and an exposure denominator and computes the rate. An endpoint accepting a
rate would let an analyst enter a number they eyeballed, and a hand-entered rate
is a risk score wearing a unit — exactly what decision 3 replaced.

**Most segments will have no data, and that is reported as unknown rather than
safe.** Segments without usable observations fall back to the population
baseline (5 per million vehicle-hours) with zero confidence. A thinly-observed
road reads as ordinary, not as clear.

**The equity report needs someone to read it.** It is on `corridor:read`
specifically so that it is not a rare-permission report nobody runs. If nobody
looks, the measurement was theatre.

## Alternatives considered

**Area-based crime avoidance, as every commercial router does it.** Rejected —
decision 1. It is the redlining, not a step toward it.

**Routing on `KNOWN_OFFENDER_PROXIMITY`.** Rejected outright.
`RoutingPolicy.permitIndividualLevelAvoidance` is typed `false`. Steering
vehicles away from named individuals is a watchlist product with a different set
of harms, and the enum member exists for incident annotation only.

**Letting the equity report auto-tune risk aversion.** Rejected — decision 4. It
would hide the trade-off it was making.

**A standing police feed for enrolled fleets.** Rejected — decision 7. Several
operators will ask for it; the answer is the incident-scoped grant.

**Third-party traffic data.** Deferred in favour of the fleet's own telemetry.
These are times this operator's vehicles actually achieved, and a segment nobody
has driven has no estimate and says so rather than inheriting a number from a
different traffic mix.
