# ADR-0008: Behaviour intelligence — measurement over inference, and the base rate

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

The Behaviour Intelligence Engine answers a different question from the
Continuous Identity Engine. Identity asks _who is driving_. This asks **what is
happening to the people in the cabin, and does it look like a hijacking in
progress?**

The two are genuinely independent. A verified driver can be under a gun — that
is what makes it a hijacking rather than a theft — and an unrecognised driver is
usually a colleague borrowing the bakkie. So identity feeds this engine as one
evidence class among several and never substitutes for it.

The brief asked for driver behaviour AI, passenger behaviour AI, stress
detection, body pose analysis, voice stress analysis, abnormal behaviour
detection and threat scoring. Most of that is buildable and useful. Two parts of
it, as they are usually sold, are neither — and the difference decides the whole
design.

Three facts constrain this far more than the accuracy targets do:

1. **Emotion cannot be read off a face or a voice.** Barrett et al. (2019),
   _Emotional Expressions Reconsidered_, is the standard review: facial
   configurations do not map reliably onto emotional states across people,
   cultures and contexts. Commercial voice-stress products have failed
   independent validation repeatedly — National Institute of Justice evaluations
   found deception detection at chance.
2. **Hijacking is rare.** On the order of one event per 200,000 trip-hours. Any
   detector operating against a base rate that low spends almost all of its
   firings being wrong, no matter how good it is.
3. **Drivers are workers.** Under the EU AI Act, inferring emotion from workers
   is a _prohibited_ practice, not a regulated one, except where it serves the
   safety of the subject. That exception is the only lawful basis this engine
   has.

## Decisions

### 1. Nothing infers an emotion. The engine reports physical measurements

No `fear`, no `anger`, no `stress level` as a psychological state — not in
`packages/types/src/behaviour.ts`, not in the Prisma schema, not in a Python
schema, not on an operator's screen.

What is measured instead: skeletal geometry, motion energy, speech prosody,
occupant counts — each expressed as a departure from **that person's own**
baseline. `arousalIndex` means "this body is doing more than it usually does".
Nothing more.

**Why:** the measurement is real and the inference is not available. Autonomic
arousal genuinely rises during a hijacking. It also rises during an argument
with a dispatcher, a near miss at a taxi rank, a hot cabin, a fast song, and
running forty minutes late — and those are thousands of times more common. A
field printing `FEAR: 0.82` would be believed by whoever read it, and it would
be wrong nearly every time it fired, in a system that can put armed responders
next to a citizen.

This is enforced rather than documented. `guard_against_affect_claims` in
`services/ai/app/behaviour/engine.py` rejects any analyser returning a signal or
indicator whose name contains an affect, mood or deception term, and it raises
rather than filtering — an analyser emitting those was built against a different
contract and its other outputs cannot be trusted either. A vendor SDK dropped in
behind this interface **will** want to return `emotion: "fear"`, because that is
what the market asks for. The guard makes that a hard error at the boundary
instead of a field that quietly reaches a screen.

### 2. Both the evidence strength and the calibrated probability are reported

`ThreatScore` carries two numbers, always displayed together:

- `score`, 0-100 — evidence strength, monotone in the combined log-likelihood
  ratio. Drives the band, the alert and the dispatch decision.
- `positivePredictiveValue` — the posterior probability that an event is
  genuinely in progress, given the same evidence **and the base rate**.

They diverge enormously. At the default base rate, with this calibration:

| Score       | Combined LR | PPV   |
| ----------- | ----------- | ----- |
| 65 (HIGH)   | ~400        | ~0.2% |
| 85 (SEVERE) | ~2,500      | ~1.2% |
| 100         | 10,000      | ~4.8% |

**Even maximal evidence leaves the alarm far more likely to be false than true.**
That is what a low base rate does to any detector, and it cannot be tuned away.

**Why report it:** this divergence is the single most important thing the engine
communicates, and suppressing it is the choice that gets an innocent person
shot. An operator shown only an 85 will treat it as a certainty and dispatch
armed responders. An operator shown 85 alongside "1.2% likely genuine" will send
someone to look.

The score still drives the response, deliberately — waiting for a PPV above 50%
on a general fleet would mean never responding at all. The PPV sets the _kind_
of response, not whether there is one: a 1% posterior justifies a phone call,
not a firearm.

It is also why `baseRatePerTripHour` is configurable and stored per assessment.
On a fleet whose real rate is one event per 1,000 trip-hours — cash-in-transit,
night routes — score 65 becomes a 29% posterior and score 85 becomes 71%. Same
evidence, same arithmetic, completely different meaning. Getting the base rate
right for a deployment matters more than any other number in this engine.

### 3. A high score requires corroboration across independent evidence classes

Evidence is tagged `EXPLICIT`, `BEHAVIOURAL`, `IDENTITY`, `CONTEXTUAL` or
`PHYSICAL`. A score built entirely from one class is capped at 55 — the top of
`ELEVATED` — and the cap is reported in `capReason` rather than applied
silently.

**Why:** one failing sensor produces a pile of mutually consistent signals that
look like overwhelming evidence and are in fact one broken camera. A cabin lens
pointed at the afternoon sun will report low keypoint coverage, an apparently
vacated driver's seat and abnormal stillness, all at once, all agreeing.
Independent classes are what make agreement informative.

`EXPLICIT` is the sole exemption, and it is not an inference: a driver pressing
the panic button or speaking their enrolled duress phrase is testimony. Doubting
it because no camera agreed would defeat the point of giving them the button.

### 4. Behaviour signals may never be used for performance management

`BehaviourPolicy.permitPerformanceManagement` is typed as the literal `false` on
every level. There is no `behaviour:export` permission and no endpoint to pair
with one.

**Why:** the lawful basis for processing these signals is the safety of the data
subject. Reusing them to rank, coach or discipline drivers is outside that basis,
converts a safety system into worker monitoring, and forfeits the exception the
whole engine depends on. The absence of an export route is the control: bulk
extraction across drivers has no safety purpose, only a performance-management
one. Evidence for a specific incident travels with the incident record.

### 5. The engine never speaks to the cabin

`notifyDriver` is `false` at every level, including `MINIMAL`.
`emitBehaviourAssessed` broadcasts to the organization room only and
deliberately not to the vehicle room, unlike every other realtime emitter.

**Why:** if duress is plausible, any in-vehicle reaction tells an attacker the
system has noticed, in front of the person it is protecting. And if duress is
not plausible, the only thing left to say to the driver is a version of "you
seem agitated", which is decision 4's prohibited use. There is no threat level
at which talking to the cabin is right, so the flag exists to make that absence
deliberate rather than an oversight.

The corollary: a duress assessment can never be resolved by asking. It is
resolved by an operator observing, or by contacting someone outside the vehicle.

### 6. Duress and unauthorised use are distinguished, and handled oppositely

If identity says the enrolled driver is still at the wheel and the cabin evidence
is bad, the working assumption is coercion: the driver is present and being
forced, so handling is covert. If identity says impostor, the driver has likely
been removed and it is a theft or an abduction, which calls for a different
response.

**Why:** treating the two alike means either warning an attacker in front of a
victim, or withholding contact from a driver who is alone and safe. Absent any
identity reading, presence is presumed — staying quiet when the driver is safe
costs far less than speaking up when they are not.

### 7. Abnormality is measured against the person, never against a population

`assessAbnormality` compares a window only to the same driver's baseline, and
reports `baselineInsufficient` rather than guessing when fewer than 20 windows
exist.

**Why:** a population anomaly detector flags whoever is least like its training
data. In practice that is the same people every week — those who work night
shifts, whose cabins are noisier, whose bodies move differently, whose first
language is not the one the acoustic model was fitted on. They are not more
dangerous, they are further from the mean, and this system delivers its false
accusations with armed responders attached. Personal baselining removes the
failure mode outright.

### 8. Passengers are analysed in aggregate, never individually

ADR-0007 established that passengers are counted and never identified. This
extends the same boundary from identity to behaviour: no per-passenger profile,
no per-passenger score, and no field in `CabinBehaviourAssessment` that could
carry one. Pose is tracked by **seat**, not by person.

**Why:** a passenger has not consented to behavioural analysis and there is no
lawful basis to build a record of one. Nor is one needed — "two people entered a
stationary vehicle within four seconds and the driver's hands went up" is
operationally decisive and identifies nobody.

### 9. Baselines learn only from unremarkable windows

A window is folded into a driver's baseline only when it scored `MINIMAL`.

**Why:** two reasons, one accidental and one adversarial. Folding a genuine
incident into a driver's "normal" teaches the system that hijackings are
ordinary for that person. And it is the obvious poisoning attack — sit in a
vehicle behaving strangely until strange becomes the mean. Baselines are also
grown one window at a time and never settable, so a baseline always reflects
driving that actually happened.

## Consequences

**The likelihood ratios are structured estimates, not measurements.** There is no
public dataset of hijackings with synchronised cabin video and audio, and there
will not be one soon — building it would require filming the event. The values in
`catalogue.ts` are ordered by how distinctive each behaviour is in ordinary
driving, and their _relative_ ordering is defensible. Their absolute magnitudes
are not. `SIGNAL_CALIBRATION_SOURCE` records this, `GET /behaviour/calibration`
exposes it with an explicit warning, and they must be refitted per deployment
from confirmed incidents and matched controls before the engine is used to
dispatch anyone.

**Most signals are worth very little, by design.** A raised voice carries a
likelihood ratio of 2.0 and a detector reliability of 0.65; vocal instability
carries 1.6 and 0.40. A strong vocal departure barely moves the score. That is
the correct outcome given what the literature supports, not a tuning problem to
be fixed later, and anyone raising these numbers to make demos more impressive
is making the system worse.

**No analyser ships in this build.** The pose _geometry_ is complete and so is
every statistical component — the keypoint estimator, the vision feature
extractor and the prosody front-end are not installed, and the routes return 501. `services/ai/app/behaviour/stress.py::request_to_features` raises rather
than returning zeros, because an arousal index of exactly baseline for every
driver reads as "nothing is wrong" rather than "nothing was measured".

**The engine is blind to new drivers.** No baseline means no abnormality
assessment and halved weight on every signal. This is the accepted cost of
decision 7, and it is visible in `GET /behaviour/drivers/:id/baseline` rather
than hidden behind a confident-looking zero.

**Cabin dynamics carry the most weight, and they are the least exciting part.**
Door sensors, belt sensors and occupant counts have detector reliabilities of
0.75-0.90, against 0.40-0.45 for everything derived from prosody. The most
useful component of a "behaviour AI" turns out to be counting.

## Alternatives considered

**A single learned model over all cabin signals.** Rejected: no labelled corpus
exists, so it would be fitted to a proxy and produce confident nonsense — and it
would make the score unexplainable at exactly the moment it needs defending.

**Emotion classification with a confidence caveat in the UI.** Rejected. The
caveat is read once and the label is read every time. If the inference is not
supported, the honest response is not to emit it.

**Reporting only the 0-100 score, with the base rate in documentation.**
Rejected — see decision 2. The number an operator acts on has to carry its own
correction, because the documentation is not open at 02:00.

**Autonomous immobilisation on a severe behaviour score.** Rejected outright.
ADR-0007 established that identity evidence never justifies stopping a moving
vehicle. Behaviour evidence is _weaker_ — smaller likelihood ratios, less
reliable detectors — so if identity cannot, this certainly cannot.

**Letting drivers see their own assessments, for transparency.** Rejected, with
regret, and it is the most uncomfortable decision here. Transparency to the data
subject is a genuine principle and this trades it away. The reason is decision 5:
a driver who can see the engine's output can also see when it has noticed
something, and so can whoever is sitting beside them. Transparency is served
instead through the calibration endpoint, the audit log, and a subject's right
to erasure of their baseline — none of which is observable in real time from
inside the vehicle.
