# Evidence and chain of custody

Evidence produced by this platform is intended to be usable in a prosecution.
That single requirement drives every design decision in the evidence module.

## The invariant

> Once an artefact is `SEALED`, its bytes and its checksum never change, and
> every subsequent access is recorded.

Everything below exists to protect that sentence.

## Lifecycle

```
PENDING_UPLOAD ──► UPLOADING ──► SEALED ──► VERIFIED
                                    │
                                    └──────► CORRUPTED   (terminal)
                                             PURGED      (terminal, retention)
```

### 1. Register before upload

`POST /api/v1/evidence` records the artefact's metadata **and the client's
locally computed SHA-256** before any bytes move.

The order is the point. A checksum supplied _after_ upload proves nothing — it
would just be a hash of whatever arrived. Declaring it first means the seal step
can prove the stored object is the object the capture device produced.

The storage key is generated server-side and namespaced by tenant
(`{organizationId}/{date}/{uuid}`). Accepting a client-supplied key would let
one tenant write into another's prefix.

### 2. Seal, with verification

`POST /api/v1/evidence/:id/seal` compares the recomputed digest against the
declared one.

On mismatch the row becomes `CORRUPTED`, a custody event is written, and the
request fails. It is **not** retried and **not** sealed. Sealing a mismatched
artefact would launder a broken file into an admissible one, which is the worst
thing this module could do.

### 3. Every access is an event

Reading a sealed artefact's metadata appends an `ACCESSED` custody event with
actor, IP and timestamp. Export requires a named recipient and a written reason,
both stored permanently.

`evidence_custody_events` is append-only. There is no update or delete method in
the repository and there must never be one — a custody chain with a gap or an
edit is inadmissible.

### 4. Periodic re-verification

`services/evidence` re-reads sealed objects on a schedule and re-hashes them.

Why re-verify something already sealed: bit rot, a botched storage migration and
a malicious edit all look identical from the database's point of view — the row
still says `SEALED`. The only way to know an artefact is still the artefact is
to hash the bytes again. Discovering corruption in a courtroom is discovering it
too late.

A mismatch is never silently repaired. The row goes `CORRUPTED` and the failure
is logged at `error`.

## Retention

`EVIDENCE_RETENTION_DAYS` is seven years and is a **floor**. The evidence
service refuses to purge anything younger regardless of what a caller asks for;
the config schema itself enforces the minimum, so a misconfigured environment
variable cannot lower it.

There is no `DELETE` route on `/evidence`. Purging is a scheduled
retention-policy operation, not something an operator can trigger from a
browser.

## Not built yet

The object-store integration. `computeStoredChecksum` in
`services/evidence/src/index.ts` throws rather than returning a placeholder,
and the worker idles with a warning when `STORAGE_*` is unset.

That is deliberate. A function that fabricated a digest would either mark every
artefact corrupt or — far worse — mark a corrupt one clean.

What is needed to finish it:

1. Choose a provider (S3-compatible; object lock / WORM support is the
   deciding feature, since it makes the invariant enforceable by the storage
   layer rather than only by our code).
2. Issue short-lived signed upload URLs so media never transits the API. The
   API's body limit is 2 MB precisely because it is not an upload path.
3. Implement streaming download-and-hash in `computeStoredChecksum`.
4. Enable object-lock retention matching `EVIDENCE_RETENTION_DAYS`.
