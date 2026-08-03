# ADR-0010: Threat decisions — competing hypotheses, and two probabilities

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

Phases 4 to 6 built three engines that each answer one question well: who is
driving, how alarming does the cabin look, and what do the sensors see. Phase 7
is asked for "the AI brain" — threat fusion, a Bayesian risk engine, threat
probability, confidence, and a decision graph.

Most of that already exists. `scoreThreat` fuses evidence with likelihood
ratios, corrects for the base rate and reports a calibrated probability. Adding
a second scorer beside it would produce two sets of constants and two answers to
the same question, which is the failure ADR-0007 decision 2 exists to prevent.

So the question is what is genuinely missing, and it is this: **every engine so
far scores a single axis, and a single axis cannot tell a stroke from a
hijacking.**

| Observed                                       | Could be          | Right response |
| ---------------------------------------------- | ----------------- | -------------- |
| Slumped driver, erratic steering, silent cabin | Medical emergency | Ambulance      |
| Driver's seat empty at speed, camera dark      | Theft, or a fault | Look, or fix   |
| Impact, raised voices, doors open              | Collision         | Ambulance      |
| Unrecognised driver, calm cabin, normal route  | A colleague       | Nothing        |

Every row scores as an elevated threat on a single axis. Sending armed
responders to the first delays an ambulance for someone having a stroke and puts
firearms next to them.

## Decisions

### 1. A closed set of competing hypotheses, not a threat axis

Eight mutually exclusive, jointly exhaustive hypotheses; the posterior over them
sums to 1. Evidence for one actively reduces belief in the others, which is
exactly what a single score cannot do.

**Why:** it is the only structure in which "slumped posture" can mean _medical
emergency_ rather than _slightly elevated threat_. The likelihood matrix gives
slumping a ratio of 45 under `MEDICAL` and 3 under `HIJACKING`, and the
posterior follows.

### 2. `SENSOR_FAILURE` is a hypothesis, not a filter

**Why:** sensors fail far more often than vehicles are attacked — the prior is
1.5e-4 against 5e-6, a factor of thirty. Without this hypothesis competing,
every dark camera and wind-saturated microphone has to be explained by something
_real_, and the engine reaches for the most alarming available explanation.

With it, "this looks alarming and is most likely a broken camera" becomes a
conclusion the engine can reach and state. On the reference scenario — cameras
obstructed, driver's seat reading empty, cabin silent — it reaches
`SENSOR_FAILURE` at 100% of the non-normal posterior and raises a maintenance
ticket instead of an alarm.

### 3. Two probabilities, because one is unusable

This is the decision the phase turns on, and the first implementation got it
wrong.

With `NORMAL` at a prior of 0.9998, no realistic evidence moves the absolute
posterior far. The first working version of this engine returned `NORMAL` as the
leading hypothesis for **every** scenario including a hijacking with a visible
weapon, because arithmetically it was right to. The engine was not conservative;
it was inert, and a monitoring system that cannot raise its voice is not a
monitoring system.

The fix is to report the two things an operator actually asks, in order:

- **`anomalyProbability`** = `1 − P(NORMAL)`. Is anything wrong? Small on almost
  every trip, and honestly so.
- **`conditional`** = `P(H | evidence, ¬NORMAL)`. Given that something is wrong,
  what is it?

The discrimination lives in the second, and it is well-behaved because the
non-normal priors span two orders of magnitude rather than six. A medical
emergency and a hijacking produce very different conditional distributions even
when both have negligible absolute posteriors.

**Why not just raise the priors?** Because that is lying about the base rate to
make the output feel responsive, and ADR-0008 already established what that
costs. The numbers stay honest; the _presentation_ changes to make them usable.

### 4. Action thresholds are cost-weighted, not probability-weighted

`MEDICAL` notifies at an anomaly probability of 0.0005. `HIJACKING` opens an
incident at 0.006. These look absurdly low next to a conventional "alert above
70%" — and a 70% threshold would mean the engine never alerts at all.

**Why:** the threshold should be set by what the action costs, not by how sure
the engine is. A phone call to check on a driver who may be having a stroke is
worth making at one-in-two-thousand. Dispatching armed responders is not worth
making at ten times that.

The values were fixed against the range the engine actually produces on
reference scenarios — a quiet trip near 0.02%, a hijacking near 0.2%, a medical
emergency near 0.6%, a collision near 5%, a failed sensor suite near 15% — and
**must be re-derived whenever the priors or likelihood tables change.** A
calibration change moves the whole distribution and leaves stale thresholds
either silent or screaming.

### 5. Confidence is separate from probability, and separately gating

`DecisionConfidence` measures how good the _evidence base_ was: coverage across
evidence classes, sensor health, calibration provenance, data sufficiency. It is
a geometric mean, so any collapsed factor collapses the whole figure.

Each threat hypothesis carries a `minimumConfidence` below which the engine will
not act on it beyond escalating to a human, whatever the posterior says.

**Why:** a posterior of 0.9 built on one degraded camera is exactly the output
that should not dispatch anyone, and it is the output a system without this rule
would dispatch on hardest. The four-way distinction matters most in one corner:
low probability with _high_ confidence is a genuine all-clear, and low
probability with _low_ confidence means the engine is blind. Rendering both as a
quiet dashboard misleads in the dangerous direction.

### 6. An ambiguous posterior is a result, not a failure

`minimumConditional` requires the leading hypothesis to hold a real share of the
non-normal posterior before it is acted on _as that hypothesis_. Below it, the
engine notifies a human and does nothing else.

**Why:** "something is wrong and I cannot tell what" is a different answer from
both an all-clear and a confident finding, and it deserves its own branch rather
than being rounded to one of them.

### 7. The decision graph is built during inference, never reconstructed

Every hypothesis appears, including the ones that lost. Every evidence edge is
signed, so edges that _lowered_ a hypothesis are visible. Every constraint that
blocked an action appears as a node.

**Why:** an investigator asking "why did this recommend an armed dispatch to a
man having a heart attack?" needs the reasoning from the record, not a
reconstruction assembled afterwards from logs. And a graph showing only
supporting evidence would be a confirmation-bias diagram.

Constraint nodes are what let the graph answer "was immobilisation considered?"
A graph that simply omitted the option would imply it was never on the table.

### 8. Overrides are first-class data

A human disagreeing with the engine is recorded on the decision, once, with a
reason of at least twenty characters. `GET /decisions/calibration-review`
aggregates override rates by hypothesis.

**Why:** this is the platform's only source of ground truth. Nobody knows what a
decision _should_ have been until a human looks at the footage. An engine that
operators routinely correct on the same hypothesis is miscalibrated in a way no
offline evaluation will reveal, and burying that in an audit log wastes it.

The override does not re-run the decision or reverse actions already taken —
rewriting the engine's conclusion would destroy the comparison that makes the
signal valuable.

## Consequences

**Vision-only evidence cannot reach a dispatch, and that is correct.** On the
reference hijacking scenario with four vision signals, the engine reaches
`HIJACKING` at 49% against `SENSOR_FAILURE` at 40% and withholds the dispatch
recommendation with an explicit constraint. Four signals from one possibly-faulty
camera genuinely do not separate those explanations. Add a gunshot and a door
sensor and the same scenario reaches 83% and recommends the dispatch — cross-class
corroboration is what unlocks it, exactly as ADR-0009 intended.

**The engine will look under-confident to anyone expecting percentages.** The
anomaly probability is under 1% on most real events. That is the base rate, it
is stated on every decision, and the thresholds are built for it.

**Priors and likelihoods are structured estimates.** `calibrationTrust` is
capped at 0.7 until they are fitted, and the cap travels with every decision so
an unfitted engine cannot present itself as a fitted one. The `SENSOR_FAILURE`
and `UNAUTHORISED_USE` priors are the two a deployment can measure quickly —
both produce observable ground truth within weeks.

**No Python was added.** Fusion is deterministic TypeScript, per ADR-0007
decision 2. There is no model here and there should not be one: the decision may
be produced in an investigation and must be recomputable without loading
weights.

**The Phase 5 threat score is still computed.** Not redundancy — it is the
continuity of the operator interface, and it is a cross-check. A high threat
score against a `SENSOR_FAILURE` posterior is the most useful disagreement the
platform can surface, and `describeDivergence` states it in words.

## Alternatives considered

**A second Bayesian scorer alongside `scoreThreat`.** Rejected — two sets of
constants for one quantity. The hijacking column of the likelihood matrix is
read from `SIGNAL_CALIBRATION` instead, so the two engines cannot drift.

**Raising the priors so posteriors look meaningful.** Rejected. That is lying
about the base rate to make a demo feel responsive, and it would silently
recalibrate every downstream threshold.

**Reporting only the conditional posterior.** Rejected — "medical emergency,
71%" reads as a finding when the chance anything is wrong at all is under one
percent. Both numbers, always, in that order.

**Letting the engine auto-dispatch above a threshold.** Rejected, consistent
with ADR-0007 decision 3 and ADR-0008 decision 2.
`permitArmedDispatchWithoutHuman` is typed as the literal `false` on every row.

**Treating `SENSOR_FAILURE` as a pre-filter rather than a hypothesis.** Rejected:
a filter has to decide before it has seen the evidence weighed. As a competing
hypothesis it can _lose_ to a real event when the evidence warrants, which is
what happens in the corroborated hijacking case where it drops to 4%.
