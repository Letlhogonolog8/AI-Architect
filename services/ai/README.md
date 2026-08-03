# services/ai

The inference gateway. Python, because that is where TensorFlow, ONNX Runtime
and OpenCV actually live — the rest of the platform is TypeScript and this
service is the deliberate exception.

**Status: architecture only.** The HTTP contract, the model registry interface
and the boundary with the API are defined. No models are trained or served yet.

## Why this is a separate process, not a library in the API

1. **Runtime.** ONNX Runtime and OpenCV are native dependencies with their own
   CUDA and BLAS requirements. Vendoring them into the API's container would
   quadruple its image size and couple its deploys to model releases.
2. **Scaling axis.** Inference scales with incident rate and frame throughput;
   the API scales with operator count. They must scale independently.
3. **Failure isolation.** A model that segfaults on a malformed frame must not
   take down the endpoint an operator is using to dispatch an ambulance.

## The contract

The API never calls a model directly. It calls this service over HTTP with an
internal service token, and this service writes results back through the API's
public endpoints — never straight into the database. Two reasons that boundary
is strict:

- Every automated decision goes through the same validation, audit and RBAC
  path as a human one. A model that could write directly to Postgres would
  bypass the audit trail, and an unaudited automated decision is unusable in an
  investigation.
- `POST /api/v1/threat-events` requires a versioned `modelId`. That is what
  makes it possible, months later, to answer "which model version decided this
  vehicle was being tailed, and what was its confidence".

## Planned models

| Model          | Input                          | Output                                  |
| -------------- | ------------------------------ | --------------------------------------- |
| `risk-vN`      | Telemetry window + context     | 0–100 composite risk score              |
| `tailing-vN`   | Multi-vehicle position streams | Following-vehicle detection             |
| `route-vN`     | Historical routes + hotspots   | Route deviation and risk forecast       |
| `duress-vN`    | Cabin audio                    | Coercion / duress speech classification |
| `vision-vN`    | Dashcam and cabin frames       | Weapon, crowd, occupancy detection      |
| `behaviour-vN` | Driving telemetry              | Driver safety scoring                   |

## The Behaviour Intelligence Engine

`app/behaviour/` analyses the cabin: body pose, physical arousal, speech
prosody, occupant dynamics and abnormality against a driver's own baseline.
Threat scoring itself lives in the API
(`packages/shared/src/behaviour/threat-score.ts`) — this service contributes
measurements only.

| Analyser  | Input                    | Output                                  |
| --------- | ------------------------ | --------------------------------------- |
| `POSE`    | Cabin frame sequence     | Skeletal posture signals                |
| `AROUSAL` | Cabin frame sequence     | Physical-activity departures            |
| `VOICE`   | Cabin audio window       | Prosodic departures, speaker count      |
| `CABIN`   | Frames + vehicle sensors | Occupant dynamics, door and belt events |

**What is implemented, and what is not.** The pose _geometry_ is complete —
every predicate, threshold and temporal aggregation in `pose.py` — as are the
arousal, prosody and abnormality statistics. What is missing is perception: the
keypoint estimator, the vision feature extractor and the prosody front-end.
Register one via `register_analyser`; until then the routes return 501.

That split is deliberate. The geometry is where the product's judgement lives —
what counts as "hands raised", how long a torso must stay turned before it stops
being a shoulder check — and it belongs in code a reviewer can argue with, not
in a model's weights. The estimator is a commodity.

### Three rules this package enforces at the boundary

**1. No analyser may return an emotion.** `guard_against_affect_claims` in
`engine.py` rejects any signal or indicator whose name contains an affect, mood
or deception term, and it raises rather than filtering. Facial and vocal
configurations do not map reliably onto emotional states (Barrett et al., 2019),
and commercial voice-stress products have failed independent validation
repeatedly. A vendor SDK dropped in behind this interface will want to return
`emotion: "fear"`, because that is what the market asks for; this makes it a
hard error instead of a field that quietly reaches an operator's screen.

**2. No raw sample is stored or returned.** Frames, audio and keypoints arrive
by opaque reference, are analysed in memory and are discarded inside the
request. A retained keypoint series is a record of how a named worker's body
moved across months of their job.

**3. Passengers are analysed in aggregate only.** No per-passenger profile, no
per-passenger score. Pose is tracked by seat, not by person — extending the
boundary ADR-0007 drew for identity.

`GET /v1/behaviour/capabilities` reports which analysers are installed and lists
the prohibited uses. See
[`docs/adr/0008-behaviour-intelligence.md`](../../docs/adr/0008-behaviour-intelligence.md).

## The Cabin Intelligence Engine

`app/cabin/` is the perception layer the Behaviour engine consumes: object and
weapon detection, occupant counting, seat attribution, camera tamper and
non-speech acoustic events.

| Detector    | Input                | Output                                   |
| ----------- | -------------------- | ---------------------------------------- |
| `OBJECT`    | Cabin frame sequence | Object classes **with ambiguity sets**   |
| `OCCUPANCY` | Cabin frame sequence | Occupant count, seat states              |
| `TAMPER`    | Cabin frame sequence | Obstruction, blinding, misalignment      |
| `ACOUSTIC`  | Cabin audio window   | Glass, impact, gunshot, alarm, door slam |

**What is implemented.** Seat-attribution geometry, box deduplication, tamper
classification from image statistics, and acoustic discrimination between glass,
gunshots, impacts, door slams and alarms — all in plain, testable code. What is
missing is perception: the person detector, the object detector and the audio
front-end. Register one via `register_detector`; until then the routes return 501.

### Four rules this package enforces at the boundary

**1. Ambiguity is required on weapon classes.** `admit_detections` rejects a
weapon detection with an empty `alternatives` list. The taxonomy includes the
confusables — `PHONE`, `WALLET`, `BOTTLE`, `TOOL` — so a detector has somewhere
to put its uncertainty. A model restricted to threat classes will label a dark
rectangular object in a hand as a handgun, because that is the only answer
available to it.

**2. No detector may identify anyone.** `guard_against_identification` rejects
output containing an embedding, a re-identification handle, or an age, gender,
ethnicity or emotion field, and it raises rather than stripping. These heads ship
enabled in most person detectors; a stripped field is a field somebody
re-enables.

**3. Weapon gates are the strictest in the platform.** A 0.75 confidence floor
and two seconds of tracking, both enforced here and again in
`packages/shared/src/cabin/weapon.ts`.

**4. Audio is events, never content.** No transcription, no keyword spotting, no
speaker identification. Glass and gunshots are spectral signatures recognisable
without understanding any speech — which is what makes a live cabin microphone
defensible at all.

The tamper detector deliberately has **no input-quality gate**: its whole job is
to fire when quality collapses, and gating it would switch off the obstruction
alarm at the moment the lens is covered.

`GET /v1/cabin/capabilities` reports which detectors are installed and lists the
prohibited uses. See
[`docs/adr/0009-cabin-intelligence.md`](../../docs/adr/0009-cabin-intelligence.md).

## Model governance, which is not optional here

Every model that reaches production must have:

- A **version in its identifier** (`tailing-v3`, never `tailing`), enforced by
  the API's schema regex.
- A recorded **confidence** on every inference, so downstream logic can
  threshold rather than treat all outputs as equal.
- A **documented false-positive cost**. A false hijacking detection dispatches
  armed responders to a citizen going about their day. This is a system where
  precision matters more than recall, and that trade-off should be an explicit
  number in the model card, not an accident of the loss function.

## Running

```bash
cd services/ai
uv sync
uv run uvicorn app.main:app --reload --port 8000
```
