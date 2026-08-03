# ADR-0006: Short access tokens with rotating, revocable refresh sessions

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

The platform authorises actions with real consequences: remotely immobilising a
vehicle, dispatching armed responders, exporting evidence for disclosure. A
compromised or stale session is not an inconvenience.

Three properties are in tension:

1. **Revocation must be immediate.** Suspending an account or removing a role
   has to take effect now, not when a token happens to expire.
2. **Operators must not be logged out mid-incident.** A control-room session
   that drops during a hijacking is a safety problem.
3. **The API runs as N stateless replicas.** Any solution requiring sticky
   sessions or in-process state is out.

A pure stateless JWT gives (2) and (3) but fails (1) outright. A pure
server-side session gives (1) but puts a datastore read on every request.

## Decision

A split model.

**Access token.** JWT, 15-minute lifetime, signed with `JWT_ACCESS_SECRET`,
carrying `sub`, `organizationId`, `roles`, `permissions` and `typ: 'access'`.
Sent as a bearer header.

**Refresh token.** JWT, 30-day lifetime, signed with a _different_ secret
(`JWT_REFRESH_SECRET`), carrying `sub`, a server-side session id `sid`, and
`typ: 'refresh'`. Delivered to browsers in an `httpOnly` cookie scoped to
`/api/v1/auth`.

**Session rows.** Every issued refresh token has a row in `sessions` holding the
**SHA-256 of the token**, never the token. Revoking the row invalidates the
token immediately.

**Rotation is single-use.** Refreshing revokes the presented token and issues a
new one.

**The principal is re-read on every request.** `authenticate` verifies the token
signature and then loads the user from the database — cached in Redis for 300
seconds — rather than trusting the roles baked into the token.

## Rationale

**Why re-read the principal instead of trusting the token.** This is what buys
property (1). A role change or suspension invalidates the cache entry and takes
effect on the next request, bounded at 5 minutes even without explicit
invalidation. Trusting the token's `permissions` claim would mean a demoted
operator keeps their old permissions for the token's full life.

The claims are still embedded in the token because they make the _client's_ UI
decisions possible without an extra round trip. They are advisory; the server's
copy is authoritative.

**Why two different secrets.** A `typ` claim alone would stop a refresh token
being presented as an access token. Separate secrets mean the mistake is also
impossible if one secret leaks. The API refuses to boot in production if they
are equal.

**Why SHA-256 and not bcrypt for the stored token.** A refresh token is already
256+ bits of signed entropy — there is nothing to brute-force. A slow KDF would
add latency to every refresh for no security gain. The hash exists so a database
dump does not yield usable credentials.

**Why single-use rotation, and what happens on replay.** Presenting a token that
has already been revoked means either a stolen token is being replayed or the
legitimate client raced itself. Both are treated as compromise: **every session
for that user is revoked**, and a `PERMISSION_DENIED` audit entry is written.
This deliberately errs toward inconveniencing a legitimate user over letting a
thief keep a foothold.

The client mitigates the self-race: concurrent 401s share a single in-flight
refresh promise, so a dashboard firing six parallel queries rotates once.

## Consequences

- Redis is on the hot path for authentication. It fails safe: a Redis outage
  falls through to a database read per request — slower, still correct.
- Revocation is bounded by the 300-second permission cache unless
  `invalidateAuthUser` is called. Every status and role mutation calls it.
- Refresh-token replay logs a user out of every device. That is intended.
- Web clients get the cookie; the mobile app holds the refresh token in
  `expo-secure-store` and sends it in the body instead.

## What was rejected

**Long-lived stateless JWTs, no server state.** Simplest and fastest, but
revocation becomes "wait for expiry". Unacceptable when a permission grants
remote immobilisation.

**Opaque tokens with a session lookup on every request.** Strong revocation, but
a datastore read on the critical path for every request including the telemetry
ingest hot path.

**Access tokens in `localStorage` for the browser, with no cookie.** Rejected
for the refresh token specifically: it is the long-lived credential and must not
be readable by script. The _access_ token is still in `localStorage`, which is
an accepted, documented trade — see the comment block in
`apps/web/src/stores/auth.store.ts`.

## Not yet built

MFA. The `mfaEnabled` and `mfaSecret` columns exist on `User` and the DTO
exposes `mfaEnabled`, but no enrolment or challenge flow is implemented. For the
roles that can immobilise a vehicle or export evidence, MFA should be mandatory
before production, not optional.
