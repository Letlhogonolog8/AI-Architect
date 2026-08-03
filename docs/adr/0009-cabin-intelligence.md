# ADR-0009: Cabin intelligence — ambiguity as a first-class output, and who may watch

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

The Cabin Intelligence Engine is the perception layer ADR-0008 deliberately
deferred. Phase 5 shipped a scorer whose front-ends were absent and whose routes
returned 501; this is those front-ends — cameras, microphones, seat sensors and
door switches, and the detectors that turn their output into something the
Behaviour Intelligence Engine can score.

The brief asked for cabin cameras, interior vision, weapon detection, object
detection, occupant counting, seat occupancy, door monitoring and audio
intelligence. Most of it is straightforward device and geometry work. Two parts
are not, and they set the design:

1. **Weapon detection is the highest-consequence output the platform can
   produce.** A false positive sends armed responders to an innocent person.
   The deployed record of the technology is poor — AI weapons screening has been
   the subject of an FTC enforcement action over accuracy claims, and cabin-scale
   object detection confuses handguns with phones, wallets and bottles in exactly
   the conditions that matter: low light, partial occlusion, motion blur, an
   object held rather than laid flat.

2. **A camera pointed at a worker for an entire shift is a different thing from
   a camera pointed at a road.** Continuous interior observation of employees
   engages POPIA and GDPR directly, and the failure modes are not accidental
   leaks but ordinary features — every off-the-shelf person detector ships with
   face embedding, re-identification and demographic heads enabled by default,
   because that is what the datasheets advertise.

## Decisions

### 1. Detectors report ambiguity; the engine never resolves it silently

`ObjectDetection.alternatives` is a required field, and for weapon classes the
API **rejects a detection that arrives without one**.

The object taxonomy deliberately includes `PHONE`, `WALLET`, `BOTTLE`, `TOOL`,
`KEYS` and `REMOTE_CONTROL`. Nobody needs to know a driver has keys. They are
there because a model restricted to threat classes has no way to say "this is
probably a phone" — it will label a dark rectangular object in a hand as a
handgun with whatever confidence its softmax produces, because that is the only
answer available to it.

**Why:** this is the single highest-leverage decision in the file. An operator
shown `WEAPON: 0.82` acts on a weapon. An operator shown `handgun 0.55, mobile
phone 0.38` looks at the footage. The information needed to make the second
screen possible already exists inside the model; discarding it at the argmax is
a choice, and it is the choice that gets someone shot.

A detector confidently reporting a weapon with an empty ambiguity set is
rejected rather than passed through with a warning. It has either solved a
problem nobody has solved, or been configured to suppress its own uncertainty on
the highest-stakes class in the taxonomy. The second is far likelier, and its
other outputs cannot be read at face value either.

### 2. A weapon detection is never a finding of fact

`WeaponAssessment.requiresHumanConfirmation` is typed as the literal `true`.
There is no confidence at which it becomes false.

The alert raised on a candidate is capped at `MEDIUM` severity and says _review
this footage_, not _there is a weapon_. Confirmation requires `cabin:review`, a
written justification, and it can be recorded only once.

**Why:** the failure is asymmetric in a way that forecloses a symmetric
threshold. A missed weapon costs the system one corroborating signal, and five
other evidence classes are still watching. A false weapon call costs a citizen an
armed confrontation. There is no trade-off point between those, so the engine
does not look for one.

The same two-number discipline as ADR-0008 applies. `candidate.confidence` is
what the detector said; `positivePredictiveValue` is how often a detector saying
that is right, given how rare weapons actually are in a cabin. At the default
base rate they differ by roughly two orders of magnitude — a 0.85 detection
lands near a 0.15% posterior. Both are stored, both are rendered, and the alert
title carries the second.

### 3. Evidence classes partition by sensor, not by subject matter

Phase 6 amends ADR-0008: `ACOUSTIC` is split out of `BEHAVIOURAL`, cabin
vision keeps `BEHAVIOURAL`, and vehicle hardware moves to `PHYSICAL`.

The rule is now explicit: **two signals belong in the same class when one broken
device could produce both.**

**Why:** the corroboration cap exists to stop a single failing sensor producing a
pile of mutually consistent signals that look overwhelming. That only works if
the partition follows failure modes. A weapon on a camera and a raised posture on
the same camera are semantically unrelated but share a lens, so they must share a
class. A raised voice and a raised posture feel like the same finding and come
from completely independent hardware, so they must not.

Before the split, a camera and a microphone independently agreeing earned no
corroboration credit — which suppressed exactly the multi-sensor evidence the
engine exists to find.

`CAMERA_OBSTRUCTED` is classed as `PHYSICAL` rather than `BEHAVIOURAL` for the
same reason inverted: it fires _because_ the camera failed, so grouping it with
that camera's observations would let a broken sensor corroborate itself.

### 4. Occupants are counted; nothing about them is inferred

`guard_against_identification` in `services/ai/app/cabin/engine.py` rejects any
detector output containing an embedding, a re-identification handle, or an age,
gender, ethnicity or emotion field. It raises rather than stripping.

**Why:** ADR-0007 decision 4 established the boundary and this is the layer where
it is actually enforceable. The breach here would not be a design decision
anyone argued for — it would be a default left on. Re-identification and
demographic heads ship enabled in most person detectors, and a stripped field is
a field somebody re-enables; a hard error at the boundary is not.

Raising rather than filtering follows the same logic as the affect guard: a
detector emitting these was built against a different contract, and the rest of
its output cannot be trusted to respect boundaries it does not know about.

### 5. Placement gates capability

A `DRIVER_FACING` camera may not report an occupant count. `PLACEMENT_CAPABILITY`
encodes this and `unobservedPositions` records which seats nothing could see.

**Why:** a driver-facing lens sees one seat. Letting it answer "how many people
are in this vehicle" makes "1" the confident answer in a vehicle carrying four,
and the under-count is invisible precisely in the situation the product exists
for. "We counted two" and "we counted two and could not see the back row" are
different claims and the engine makes both sayable.

### 6. Occupancy hysteresis is asymmetric

A rise in the occupant count is accepted after 2 confirmations; a fall after 5.

**Why:** under-counting is the dangerous error. A hijacking _adds_ occupants, and
an occupant who disappears from view has usually been occluded rather than
removed. Accepting falls quickly would let the count drop back to normal in the
middle of an incident and silently withdraw the evidence. The asymmetry biases
toward a recoverable false alarm rather than an unrecoverable silence.

### 7. No media is retained outside an incident

`CabinRetentionPolicy.retainMediaByDefault` is typed as the literal `false`. No
Prisma column holds pixels or samples. Frames and audio live in a 60-second
rolling in-memory buffer and are committed to durable storage only when an
incident is opened, through the evidence service, where they inherit a chain of
custody and a retention clock.

**Why:** the pre-incident minutes are the ones an investigator needs and the ones
that cannot be recovered retrospectively, so _some_ buffer is necessary. Sixty
seconds is long enough to capture an approach and short enough that the buffer is
not a de facto recording. Typing the flag as a literal means enabling continuous
retention is a reviewable code change rather than a checkbox somebody ticks
during a pilot and nobody unticks afterwards.

### 8. The recording indicator is constant, never reactive

`recordingIndicatorFitted` has no default and enrolment is refused without it.
`mayIndicatorReflectDetectionState()` returns `false` with its reasoning
attached.

**Why:** two requirements that look contradictory and are not. Workers under
continuous observation must know the camera is there — that is a legal
requirement and a decent one. But ADR-0008 decision 5 forbids any in-vehicle
signal that changes when the engine notices something, because an attacker who
sees the system react knows the driver triggered it.

A **constant** light satisfies both: it discloses everything the driver is owed
and nothing an attacker can use. A light that changes satisfies neither
properly. The distinction is precise and easy to lose, so it is encoded rather
than described.

### 9. `cabin:stream` is a separate permission from `cabin:read`

Reading "3 occupants, one unattributed" and watching live interior video of a
person at work are gated separately. `POLICE` and `ANALYST` hold `cabin:read`
and not `cabin:stream`.

**Why:** a role system that grants them together has not understood the
difference. Almost everything the control room does is served by detections. Live
video of a driver's face is for an incident in progress, and it should be held by
fewer people and withdrawable on its own without blinding an operator entirely.

An external principal in particular — the police liaison — can examine the
evidence behind a dispatch through detections and sealed incident media, and does
not need a live window into a working person's cabin to do it.

## Consequences

**No detector ships in this build.** The geometry and signal processing are
complete: seat attribution, box deduplication, tamper classification from image
statistics, and acoustic discrimination between glass, gunshots, impacts, door
slams and alarms. What is absent is perception — the person detector, the object
detector and the audio front-end — and those routes return 501.

**The most useful component turns out to be counting.** Door switches, belt
sensors and occupant counts carry detector reliabilities of 0.75–0.95, against
0.35 for the weapon detector and 0.40–0.45 for anything derived from prosody. A
door sensor has nothing to infer, no lighting dependency and no demographic error
surface. When the scorer weights it above a weapon detection it is not being
crude; it is being correct, and this will read as wrong to anyone who came for
the weapon detection.

**The weapon detector contributes far less to a threat score than its name
suggests.** LR 80 times reliability 0.35, further discounted for ambiguity and
frame quality, lands near the per-signal cap — roughly the same contribution as a
door opening at speed. That is the intended relative weighting.

**Tamper detection cannot distinguish tape from grime.** It does not try. A
covered lens and a dirty one produce identical image statistics, and the engine
reports the obstruction and lets corroboration decide — the same reading is a
maintenance ticket on a Tuesday morning and evidence thirty seconds after an
unexpected stop.

**Occupancy tracker state is in memory and not persisted.** On a multi-node
deployment each node settles independently. Acceptable: the stabilised count
converges within seconds, and persisting a smoothing filter would add a write per
window for no operational gain.

## Alternatives considered

**Emitting a boolean `weaponDetected`.** Rejected — decision 1. The ambiguity is
the product.

**Auto-escalating a high-confidence weapon detection to CRITICAL.** Rejected. At
the default base rate a 0.9 detection is still wrong the overwhelming majority of
the time, and the escalation path would be an armed response.

**One `cabin:read` permission covering video.** Rejected — decision 9.

**Retaining a rolling hour of cabin video for investigation quality.** Rejected.
The marginal investigative value over 60 seconds is small; the artefact created
is a continuous video record of a worker's shift, and the request to extend it
will come from operations rather than from investigators.

**Letting the recording indicator flash on detection, as a deterrent.** Rejected
— decision 8. The deterrent value is speculative; the cost is telling a hijacker
that the driver's system has noticed them, while the driver is still in the car.
