# ADR-0007: Biometric identity — storage, fusion and permitted response

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

The Continuous Identity Engine answers one question, continuously: **is the
person driving this vehicle the person who should be?** A hijacker takes the
vehicle _after_ authentication has already succeeded, so identity has to be
re-established from ambient evidence for the whole trip.

That requires processing faces, voices and driving behaviour — special-category
personal data under POPIA (South Africa, the launch market) and GDPR. It also
produces a score that can trigger a response involving armed people. Both facts
constrain the design far more than the accuracy targets do.

## Decisions

### 1. Raw biometrics are never stored, transmitted or persisted

Only irreversible templates — fixed-length embeddings — encrypted under a
per-tenant KMS key. No type in `packages/types/src/identity.ts`, no column in
the Prisma schema and no endpoint in the API carries an image, an audio clip, or
anything from which one could be reconstructed.

**Why:** a password can be rotated after a breach; a face cannot. The blast
radius of a template leak is bounded by the tenant key, which _is_ revocable —
that is what makes an enrolment cancellable despite the underlying biometric
being permanent. Re-enrolment supersedes rather than overwrites, so historical
assessments stay attributable to the template that actually produced them.

### 2. Fusion is deterministic TypeScript, not a model

`packages/shared/src/identity/fusion.ts` combines per-modality scores into the
driver confidence score. The Python service does _inference_; it never decides.

**Why:** the confidence figure may be produced in an investigation. It must be
recomputable and explainable without loading a model, and the API, console and
mobile app must all agree on what "34%" means. A learned fusion layer would make
the number authoritative and unexaminable at the same time.

The maths is log-likelihood-ratio addition with quality weighting and
per-modality exponential decay. Calibration maps each modality's raw score onto
a commensurable LLR; raw scores are **not** averaged, because a face model's 0.8
and a behaviour model's 0.8 are different claims.

### 3. Identity alone never triggers a physical action

`IdentityPolicy.permitAutonomousImmobilisation` is typed as the literal `false`
and is `false` on every band. Changing it requires editing the contract in
`@aegisdrive/types` — a reviewable change, not a config edit.

**Why:** published NIST evaluations find false match rates varying by up to an
order of magnitude across demographic groups. A system that immobilised a
vehicle on a face mismatch would strand people on highways and would do it
disproportionately to the drivers the models serve worst. That is a safety
defect and a discrimination liability in one object.

The strongest automated response available is **raising it to a human**.
Immobilisation requires corroborating non-identity evidence and an operator
holding `vehicle:immobilise`.

### 4. Passengers are counted, never identified

`OccupancyResponse` returns `unrecognised_count` as a number and nothing else —
no embedding, no bounding box, no attributes. Only templates of consenting,
enrolled occupants are ever compared against.

**Why:** a passenger has not consented to being identified, and there is no
lawful basis to do it. The operationally useful signal — "three people in a
vehicle that should have one" — needs no identification whatsoever. Building the
capability anyway would create a facility that is eventually misused, and the
product gains nothing from it.

### 5. Liveness runs before comparison, and overrides it

A detected presentation attack zeroes the score and forces the `IMPOSTOR` band.
It is not weighed against other evidence.

**Why:** a photograph held to a lens scores a near-perfect face match. Without
liveness first, the highest-confidence result the system can produce is also the
easiest to forge. Running liveness after comparison — or skipping it when the
score is high — is the most common way biometric systems are defeated.

### 6. A challenge is a signal, never a gate

`IdentityChallenge.failureIsNotProof` is typed `true`. A failed or ignored
challenge is recorded and never used alone to downgrade identity.

**Why:** a driver being hijacked may be physically unable to answer. Treating
silence as guilt would make the system hurt exactly the people it exists to
protect. For the same reason the `IMPOSTOR` band deliberately does **not**
challenge the driver — a prompt would warn an attacker, in front of the victim.

## Consequences

**Calibration constants are placeholders.** The values in `calibration.ts` are
derived from published benchmark characteristics, not from AEGISDRIVE data.
`CALIBRATION_SOURCE` records which set is in force. They must be refitted on
real enrolment data per deployment population, and validated for demographic
parity, before production. Until then the engine works and its numbers are
directionally right, but they are not trustworthy to two decimal places.

**The independence assumption is false and knowingly so.** Face and voice
degrade together — a struggle in the cabin corrupts both — so their errors
correlate and naive LLR addition overstates confidence. Two mitigations:
per-modality LLR caps, and a geometric correlation discount on agreeing
biometric modalities. The discount errs conservative: it lowers confidence
rather than raising it. A full covariance model needs joint-distribution data
that does not exist yet.

**No recogniser ships in this build.** `UnavailableRecogniser` returns 501 with
a precise message. A recogniser that returned 0.5 for everything would look like
it worked while deciding identity by coin flip.

**Consent withdrawal is gated on `identity:read`, not `identity:manage`.** A
subject must never be blocked from withdrawing consent by an authorisation rule.

## Alternatives considered

**Fusion inside the model service.** Rejected: makes the score unexplainable
without the model, and splits the definition of "confidence" across two
languages.

**A single threshold per modality.** Rejected: it makes the accept/reject
decision twice — once in Python, once in the fusion engine — with two sets of
constants that will drift.

**Storing raw samples for model retraining.** Rejected outright. The retraining
value is real; the liability of a biometric corpus of hijacking victims is not
something this product should hold. Retraining uses consented, separately
governed datasets.

**Autonomous immobilisation above a confidence threshold.** Rejected — see
decision 3. There is no threshold at which a biometric mismatch alone justifies
stopping a moving vehicle.
