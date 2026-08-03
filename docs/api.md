# API reference

Base path: `/api/v1`. Every route below is relative to it.

## Envelope

Every response, success or failure, has one of two shapes.

```jsonc
// 2xx
{ "success": true, "data": { /* … */ }, "requestId": "018f…" }

// non-2xx
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields failed validation.",
    "details": { "email": ["Must be a valid email address."] }
  },
  "requestId": "018f…"
}
```

Switch on `error.code` — the codes are stable and listed in
`packages/shared/src/errors/error-codes.ts`. `message` is for humans and may
change.

`requestId` appears in the `X-Request-Id` response header and in every server
log line for that request. Quote it in bug reports.

## Pagination

List endpoints accept `page`, `pageSize` (max 200), `sortBy`, `sortOrder` and
return:

```jsonc
{
  "items": [/* … */],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 142,
    "totalPages": 6,
    "hasNextPage": true,
    "hasPreviousPage": false,
  },
}
```

## Authentication

```http
Authorization: Bearer <accessToken>
```

Access tokens last 15 minutes. Refresh tokens last 30 days, are **single-use**,
and are returned both in the body and as an httpOnly cookie. Browsers should
rely on the cookie.

Presenting an already-revoked refresh token is treated as compromise: every
session for that user is destroyed and the event is audited.

| Method | Path                        | Permission    | Notes                                    |
| ------ | --------------------------- | ------------- | ---------------------------------------- |
| POST   | `/auth/login`               | —             | Rate-limited separately: 20 per 5 min    |
| POST   | `/auth/refresh`             | —             | Rotates the pair                         |
| POST   | `/auth/logout`              | authenticated | Revokes this session                     |
| POST   | `/auth/logout-all`          | authenticated | Revokes every session                    |
| GET    | `/auth/me`                  | authenticated | The principal, with resolved permissions |
| GET    | `/auth/sessions`            | authenticated | Own sessions only                        |
| DELETE | `/auth/sessions/:sessionId` | authenticated | Own sessions only                        |

Every credential failure returns the same `AUTH_INVALID_CREDENTIALS` and the
same message, whether the account is missing, suspended or locked. That is
deliberate — anything more specific is account enumeration.

## Resources

### Fleet

| Method    | Path                              | Permission                      |
| --------- | --------------------------------- | ------------------------------- |
| GET       | `/vehicles`                       | `vehicle:read`                  |
| POST      | `/vehicles`                       | `vehicle:create`                |
| GET       | `/vehicles/:vehicleId`            | `vehicle:read`                  |
| PATCH     | `/vehicles/:vehicleId`            | `vehicle:update`                |
| POST      | `/vehicles/:vehicleId/status`     | `vehicle:update`                |
| POST      | `/vehicles/:vehicleId/immobilise` | `vehicle:immobilise`            |
| DELETE    | `/vehicles/:vehicleId`            | `vehicle:delete`                |
| GET/POST  | `/drivers`                        | `driver:read` / `driver:create` |
| GET/PATCH | `/drivers/:driverId`              | `driver:read` / `driver:update` |
| POST      | `/drivers/:driverId/status`       | `driver:update`                 |

`status`, `riskScore` and `threatLevel` are absent from the vehicle create and
update bodies. They are written by the telemetry and risk engines, not by a
form.

### Incidents

| Method   | Path                              | Permission                          |
| -------- | --------------------------------- | ----------------------------------- |
| GET      | `/incidents`                      | `incident:read`                     |
| POST     | `/incidents`                      | `incident:create`                   |
| GET      | `/incidents/:incidentId`          | `incident:read`                     |
| PATCH    | `/incidents/:incidentId`          | `incident:update`                   |
| POST     | `/incidents/:incidentId/status`   | `incident:update`                   |
| POST     | `/incidents/:incidentId/dispatch` | `incident:dispatch`                 |
| GET/POST | `/incidents/:incidentId/timeline` | `incident:read` / `incident:update` |

Status transitions are validated server-side. `DETECTED → ARCHIVED` is rejected
with 409: it would skip the triage record the platform is expected to produce.
The permitted graph is in `incident.service.ts`.

### Evidence

| Method | Path                            | Permission        |
| ------ | ------------------------------- | ----------------- |
| GET    | `/evidence`                     | `evidence:read`   |
| POST   | `/evidence`                     | `evidence:upload` |
| GET    | `/evidence/:evidenceId`         | `evidence:read`   |
| POST   | `/evidence/:evidenceId/seal`    | `evidence:upload` |
| POST   | `/evidence/:evidenceId/export`  | `evidence:export` |
| GET    | `/evidence/:evidenceId/custody` | `evidence:read`   |

There is no `DELETE`. Reading a sealed artefact appends an `ACCESSED` custody
event. Export requires a recipient and a written reason.

### Telemetry

| Method | Path                                    | Permission         |
| ------ | --------------------------------------- | ------------------ |
| POST   | `/telemetry`                            | `telemetry:ingest` |
| GET    | `/telemetry/vehicles/:vehicleId`        | `telemetry:read`   |
| GET    | `/telemetry/vehicles/:vehicleId/latest` | `telemetry:read`   |

Ingest is batch-first (1–500 frames), idempotent, and returns **202** — the
frames are durable but the risk engine has not scored them yet. It has its own
rate-limit bucket so device traffic cannot starve operators.

### Threat intelligence, alerts, notifications

| Method | Path                                        | Permission          |
| ------ | ------------------------------------------- | ------------------- |
| GET    | `/threat-events`                            | `threat:read`       |
| POST   | `/threat-events`                            | `threat:manage`     |
| GET    | `/threat-events/zones`                      | `threat:read`       |
| POST   | `/threat-events/:threatEventId/acknowledge` | `threat:read`       |
| GET    | `/alerts`                                   | `alert:read`        |
| POST   | `/alerts/:alertId/acknowledge`              | `alert:acknowledge` |
| POST   | `/alerts/:alertId/suppress`                 | `alert:suppress`    |
| GET    | `/notifications`                            | `notification:read` |
| POST   | `/notifications/send`                       | `notification:send` |

`modelId` on a threat event must match `^[a-z0-9][a-z0-9-]*-v\d+$` — `tailing-v3`,
not `tailing`. An automated decision that cannot be traced to a model version is
not auditable.

### Continuous Identity Engine

| Method   | Path                                        | Permission                          |
| -------- | ------------------------------------------- | ----------------------------------- |
| POST     | `/identity/observations`                    | `identity:submit`                   |
| GET      | `/identity/assessments`                     | `identity:read`                     |
| GET      | `/identity/drivers/:driverId/confidence`    | `identity:read`                     |
| GET      | `/identity/enrolments`                      | `identity:read`                     |
| POST     | `/identity/enrolments`                      | `identity:enrol`                    |
| DELETE   | `/identity/enrolments/:enrolmentId`         | `identity:read`                     |
| POST     | `/identity/devices/attest`                  | `identity:submit`                   |
| GET      | `/identity/drivers/:driverId/devices`       | `identity:read`                     |
| POST     | `/identity/challenges/:challengeId/respond` | `identity:submit`                   |
| GET/POST | `/identity/occupants`                       | `identity:read` / `identity:manage` |

**No route accepts a raw biometric and none returns a template.** The API
receives scores from the AI gateway and opaque template handles from enrolment.
Consent withdrawal is gated on `identity:read`, not `identity:manage` — a
subject must never be blocked from withdrawing consent by an authorisation rule.
See [ADR-0007](./adr/0007-biometric-identity.md).

### Behaviour Intelligence Engine

| Method | Path                                    | Permission         |
| ------ | --------------------------------------- | ------------------ |
| POST   | `/behaviour/observations`               | `behaviour:submit` |
| GET    | `/behaviour/assessments`                | `behaviour:read`   |
| GET    | `/behaviour/vehicles/:vehicleId/threat` | `behaviour:read`   |
| GET    | `/behaviour/drivers/:driverId/threat`   | `behaviour:read`   |
| GET    | `/behaviour/drivers/:driverId/baseline` | `behaviour:read`   |
| DELETE | `/behaviour/drivers/:driverId/baseline` | `behaviour:manage` |
| GET    | `/behaviour/calibration`                | `behaviour:read`   |

Ingest shares the telemetry rate-limit bucket. `POST /behaviour/observations`
accepts derived signals from the closed `BehaviourSignal` catalogue — never a
frame, an audio buffer or a keypoint series.

**Every assessment carries two numbers and they must be shown together:**
`threat.score` (0–100 evidence strength) and
`threat.positivePredictiveValue` (probability the event is genuine, given the
base rate). They diverge by a lot. At the default base rate — one event per
200,000 trip-hours — a score of 85 corresponds to a PPV near **1.2%**, and even
a score of 100 only reaches ~4.8%. Rendering the score without the PPV is a
defect, not a layout choice.

`baseRatePerTripHour` is stored on every assessment and should be configured per
fleet: at one event per 1,000 trip-hours the same score of 85 is a 71% posterior.

`corroborationCapped` means the score was held down because all evidence came
from a single class; `capReason` says so in words. `GET /behaviour/calibration`
returns the likelihood ratios in force and warns when they are still the shipped
estimates rather than numbers fitted to real data.

Four routes deliberately do not exist: no export, no raw-sample ingest, no
driver-facing read, and no baseline write. See
[ADR-0008](./adr/0008-behaviour-intelligence.md) for why each is absent.

### Cabin Intelligence Engine

| Method | Path                                            | Permission     |
| ------ | ----------------------------------------------- | -------------- |
| POST   | `/cabin/snapshots`                              | `cabin:submit` |
| POST   | `/cabin/sensors/heartbeat`                      | `cabin:submit` |
| GET    | `/cabin/detections`                             | `cabin:read`   |
| GET    | `/cabin/vehicles/:vehicleId/cabin`              | `cabin:read`   |
| POST   | `/cabin/detections/:detectionId/weapon-verdict` | `cabin:review` |
| GET    | `/cabin/vehicles/:vehicleId/sensors`            | `cabin:read`   |
| POST   | `/cabin/sensors`                                | `cabin:manage` |
| PATCH  | `/cabin/sensors/:sensorId`                      | `cabin:manage` |
| DELETE | `/cabin/sensors/:sensorId`                      | `cabin:manage` |
| GET    | `/cabin/retention-policy`                       | `cabin:read`   |

`POST /cabin/snapshots` takes an analysis **window**, not a frame, and accepts
derived detections only — never pixels or audio. It returns the derived
`BehaviourSignal[]` so the caller can fold them into a
`POST /behaviour/observations` submission without a second round trip.

**A weapon-class detection is rejected without a populated `alternatives`
array.** The taxonomy includes the confusables (`PHONE`, `WALLET`, `BOTTLE`,
`TOOL`) so ambiguity has somewhere to go; a detector reporting a handgun with no
alternatives has suppressed its own uncertainty and its confidence cannot be
read at face value.

Weapon candidates carry both `detectorConfidence` and
`positivePredictiveValue`, and clients must render both — at the default base
rate a 0.85 detection sits near a 0.15% posterior. A candidate raises a
`MEDIUM` alert saying _review this footage_, never higher; escalation needs a
`cabin:review` verdict with a written justification, recorded once and not
revisable.

`cabin:stream` gates live interior video and is deliberately separate from
`cabin:read` — `POLICE` and `ANALYST` hold the latter and not the former. There
is no `cabin:export`: media leaves only through the evidence chain of custody,
scoped to an incident. See [ADR-0009](./adr/0009-cabin-intelligence.md).

### Threat Decision Engine

| Method | Path                              | Permission          |
| ------ | --------------------------------- | ------------------- |
| POST   | `/decisions`                      | `behaviour:submit`  |
| GET    | `/decisions`                      | `decision:read`     |
| GET    | `/decisions/calibration-review`   | `decision:read`     |
| GET    | `/decisions/vehicles/:vehicleId`  | `decision:read`     |
| GET    | `/decisions/:decisionId`          | `decision:read`     |
| POST   | `/decisions/:decisionId/override` | `decision:override` |

`POST /decisions` takes a **behaviour assessment id**, not a decision. The
engine infers from the durably recorded evidence, so the result is reproducible
from its own record. There is no endpoint that accepts a posterior, a hypothesis
or a graph.

**Every decision carries two probabilities and clients must render both:**

- `anomalyProbability` — `1 − P(NORMAL)`. Is anything wrong? Under 1% on most
  real events, which is the base rate rather than a defect.
- `hypothesisConfidence` — `P(H | evidence, ¬NORMAL)`. Given something is wrong,
  how clearly is it _this_?

Showing the second alone reads as a finding ("medical emergency, 71%") when the
chance anything is wrong at all is a fraction of a percent. A third figure,
`confidence.overall`, is separate again: it measures how good the evidence base
was, not how likely the explanation is. Low probability with high confidence is
an all-clear; low probability with low confidence means the engine is blind.

`posteriors` is the full distribution including the hypotheses that lost, and
`graph` is the reasoning as a DAG — evidence, priors, every hypothesis, the
constraints that blocked actions, and the decision. `constraints` is how the
record shows what was considered and declined; `NO_AUTONOMOUS_IMMOBILISATION`
appears on every threat decision.

Action thresholds are **cost-weighted**: `MEDICAL` notifies at an anomaly
probability of 0.0005 because a phone call is cheap, while an armed dispatch
needs far more and a human to commit it. Overrides are recorded once, require a
reason, and drive `calibration-review`. See
[ADR-0010](./adr/0010-threat-decision-engine.md).

### SafeCorridor

| Method | Path                                            | Permission              |
| ------ | ----------------------------------------------- | ----------------------- |
| POST   | `/corridor/plans`                               | `corridor:plan`         |
| GET    | `/corridor/plans`                               | `corridor:read`         |
| GET    | `/corridor/plans/:planId`                       | `corridor:read`         |
| POST   | `/corridor/hazards`                             | `corridor:manage`       |
| GET    | `/corridor/havens`                              | `corridor:read`         |
| GET    | `/corridor/havens/nearest`                      | `corridor:read`         |
| POST   | `/corridor/havens`                              | `corridor:manage`       |
| POST   | `/corridor/havens/:havenId/verify`              | `corridor:manage`       |
| GET    | `/corridor/equity-report`                       | `corridor:read`         |
| POST   | `/corridor/police-shares`                       | `corridor:share-police` |
| GET    | `/corridor/police-shares/:shareId`              | `corridor:read`         |
| POST   | `/corridor/police-shares/:shareId/revoke`       | `corridor:share-police` |
| GET    | `/corridor/incidents/:incidentId/police-shares` | `corridor:read`         |

`POST /corridor/plans` currently returns **501**. The hazard model, objective,
detour bounds, haven coverage and equity accounting are built; the road-graph
provider that turns coordinates into candidate paths is not, per
[ADR-0004](./adr/0004-mapbox-deferred.md).

**Hazard is a rate, not a score.** `POST /corridor/hazards` takes a confirmed
incident count and an exposure denominator in vehicle-hours, and computes
incidents per million vehicle-hours. There is no way to submit a rate directly —
a hand-entered rate is a risk score wearing a unit. Reporting-biased sources
(`POLICE_STATISTICS`, `PARTNER_FEED`) lower the confidence rather than adjusting
the rate, and hazards below the confidence floor do not influence routing.

**Four things deliberately have no endpoint:** destination exclusion (there is no
`avoidAreas`, no blocklist and no permission for one), area-level hazard (writes
key on a segment id), a standing police feed, and equity-record deletion.

`GET /corridor/equity-report` shows the detour burden by coarse destination cell
and flags cells carrying at least twice the fleet median. It sits on
`corridor:read` on purpose — behind a rare permission it becomes a report nobody
runs. It never auto-corrects the routing.

Police shares require an incident, a written justification and an expiry of at
most twelve hours. Expiry, revocation and incident closure are enforced in the
query, so a lapsed grant returns 404 rather than stale route data.
`corridor:share-police` is held by operators and security, not by `POLICE` — the
party receiving visibility must not be the party authorising it. See
[ADR-0011](./adr/0011-safecorridor-routing.md).

### Administration

| Method    | Path                            | Permission                                  |
| --------- | ------------------------------- | ------------------------------------------- |
| GET       | `/dashboard/snapshot`           | `dashboard:read`                            |
| GET       | `/analytics/summary`            | `analytics:read`                            |
| GET/PATCH | `/organization`                 | `organization:read` / `organization:manage` |
| GET/POST  | `/users`                        | `user:read` / `user:create`                 |
| PUT       | `/users/:userId/roles`          | `user:update` **and** `role:manage`         |
| POST      | `/users/:userId/reset-password` | `user:update`                               |
| GET       | `/roles`                        | `role:read`                                 |
| GET       | `/audit-logs`                   | `audit:read`                                |

`/organization` is singular and takes no id — the tenant comes from the token.
There is no create, update or delete on `/roles`; see
[`architecture/rbac.md`](./architecture/rbac.md).

## Realtime

Socket.IO at path `/realtime`, namespace `/ops`. Authenticate in the handshake:

```js
io('/ops', { path: '/realtime', auth: { token: accessToken } });
```

Sockets join `org:<organizationId>` at handshake and may additionally subscribe
to `vehicle:<id>` and `incident:<id>`. Every broadcast targets a room; the
organisation room is the tenancy boundary.

Server events: `connection:ack`, `vehicle:position`, `vehicle:status`,
`incident:created`, `incident:updated`, `alert:raised`, `alert:acknowledged`,
`threat:detected`, `behaviour:assessed`, `fleet:snapshot`, `system:error`.

`behaviour:assessed` goes to the organisation room **only**, never to a vehicle
room, because a device inside the vehicle can subscribe to that room and a
duress assessment is precisely what an attacker must not learn has been
produced. Enforced in `emitBehaviourAssessed`.

The full typed contract is `packages/types/src/realtime.ts`, and both ends of
the wire are checked against it.

## Rate limits

| Bucket | Window | Limit |
| ------ | ------ | ----- |
| global | 60s    | 300   |
| auth   | 300s   | 20    |
| ingest | 60s    | 6000  |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`;
429s carry `Retry-After`. The limiter fails **open** — if Redis is unreachable
requests are allowed. Losing the cache degrades protection, not availability.
