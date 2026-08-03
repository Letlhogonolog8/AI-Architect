import type { ISODateString, TenantScoped, UUID } from './common';
import type { IncidentSeverity } from './enums';
import type { AutonomyLevel } from './command-centre';
import type { BehaviourSignal, ThreatEvidenceClass } from './behaviour';
import type { IdentityBand } from './identity';

/**
 * Threat Decision Engine.
 *
 * The layer that decides *what is happening*, as opposed to *how alarming it
 * looks*.
 *
 * ## Why this exists when Phase 5 already scores threats
 *
 * `scoreThreat` answers one question — "how much evidence is there for a
 * hijacking?" — and answers it well. But a single threat axis cannot
 * distinguish between events that produce nearly identical evidence and demand
 * opposite responses:
 *
 * | Observed                                          | Could be           |
 * | ------------------------------------------------- | ------------------ |
 * | Slumped driver, erratic steering, cabin silent     | Medical emergency  |
 * | Driver's seat empty at speed, camera dark          | Theft — or a fault |
 * | Sudden impact, raised voices, doors open           | Collision          |
 * | Unrecognised driver, calm cabin, normal route      | A colleague        |
 *
 * Every row scores as an elevated threat. Dispatching armed responders to the
 * first is not merely a false positive — it delays an ambulance for a person
 * having a stroke, and it puts firearms next to them.
 *
 * So this engine replaces the single axis with a **set of competing
 * hypotheses** and asks which one best explains the evidence. That is a
 * different question, and it is the one an operator actually needs answered.
 *
 * ## What it does not do
 *
 * It does not re-score anything. `fuseIdentity` and `scoreThreat` remain the
 * authorities on identity confidence and hijacking-evidence strength, and this
 * engine consumes their output. A second scorer would mean two sets of
 * constants and two answers to the same question — the failure ADR-0007
 * decision 2 exists to prevent.
 *
 * The hijacking column of the likelihood matrix is **anchored** to the
 * Phase 5 calibration rather than restated, so the two cannot drift apart.
 *
 * See `docs/adr/0010-threat-decision-engine.md`.
 */

// ============================================================================
// Hypotheses
// ============================================================================

/**
 * The closed hypothesis set.
 *
 * Mutually exclusive and jointly exhaustive: exactly one is true at any moment,
 * and the posterior over them sums to 1. That constraint is what makes the
 * arithmetic Bayesian rather than a set of independent scores, and it is what
 * lets evidence for one hypothesis actively *reduce* belief in another.
 *
 * Closed, for the same reason the behaviour signal catalogue is: an open set
 * would let a model invent an explanation nobody validated, and an operator
 * would read meaning into a label that was never tested.
 */
export const ThreatHypothesis = {
  /** Nothing is wrong. Overwhelmingly the correct answer, and the default. */
  NORMAL: 'NORMAL',

  /**
   * The evidence is better explained by broken sensors than by any event.
   *
   * A first-class hypothesis rather than a filter, and one of the most
   * important decisions in this file. Sensors fail far more often than
   * hijackings happen. Without this hypothesis competing, every dark camera and
   * every wind-saturated microphone has to be explained by something *real*,
   * and the engine reaches for the most alarming available explanation.
   *
   * With it, "this looks alarming and is most likely a broken camera" becomes a
   * conclusion the engine can actually reach and state.
   */
  SENSOR_FAILURE: 'SENSOR_FAILURE',

  /** The enrolled driver is in the vehicle and being coerced; it is being taken. */
  HIJACKING: 'HIJACKING',
  /** The vehicle is being taken without the driver in it. */
  THEFT: 'THEFT',
  /**
   * The driver is being coerced but the vehicle has not been taken — forced to
   * drive somewhere, or held at a stop. Distinguished from hijacking because
   * the vehicle's behaviour looks normal while the cabin does not.
   */
  DURESS: 'DURESS',

  /** The driver is incapacitated. Needs an ambulance, not an armed response. */
  MEDICAL: 'MEDICAL',
  COLLISION: 'COLLISION',

  /**
   * Someone other than the enrolled driver is driving, without coercion — a
   * colleague, a family member, a relief shift nobody logged.
   *
   * Far more common than theft, and the reason a low identity score must never
   * escalate on its own.
   */
  UNAUTHORISED_USE: 'UNAUTHORISED_USE',
} as const;
export type ThreatHypothesis = (typeof ThreatHypothesis)[keyof typeof ThreatHypothesis];

/** Hypotheses that call for an emergency medical response rather than security. */
export const MEDICAL_HYPOTHESES: readonly ThreatHypothesis[] = [
  ThreatHypothesis.MEDICAL,
  ThreatHypothesis.COLLISION,
];

/** Hypotheses in which a person is being coerced and must not be contacted. */
export const COERCION_HYPOTHESES: readonly ThreatHypothesis[] = [
  ThreatHypothesis.HIJACKING,
  ThreatHypothesis.DURESS,
];

/**
 * One hypothesis' standing after the evidence.
 *
 * ## Why there are two posteriors
 *
 * The absolute posterior is dominated by the prior and is almost always tiny.
 * With `NORMAL` at 0.9998, no realistic evidence moves it far — a slumped
 * driver with erratic steering reaches a `MEDICAL` posterior around 0.3%, and
 * that figure is arithmetically correct.
 *
 * Reported alone it is useless: every hypothesis reads as "almost certainly
 * not", the leading explanation is always `NORMAL`, and the engine can never
 * say anything. That is not conservatism, it is inertness, and a monitoring
 * system that cannot raise its voice is not a monitoring system.
 *
 * So the engine reports both, and they answer the two questions an operator
 * actually asks in order:
 *
 * 1. **Is something wrong?** → `ThreatDecision.anomalyProbability`, which is
 *    `1 − P(NORMAL)`. Small, honest, and the trigger for acting at all.
 * 2. **Given that something is wrong, what is it?** → `conditional`, the
 *    posterior renormalised across the non-normal hypotheses only.
 *
 * The second is where the discrimination lives, and it is well-behaved because
 * the non-normal priors span two orders of magnitude rather than six. A medical
 * emergency and a hijacking produce very different conditional distributions
 * even when both have negligible absolute posteriors.
 */
export interface HypothesisPosterior {
  hypothesis: ThreatHypothesis;
  /** Prior probability, before evidence. */
  prior: number;
  /** Product of likelihood ratios for this hypothesis, log10. */
  logLikelihood: number;
  /**
   * Absolute posterior. Sums to 1 across the whole set, `NORMAL` included.
   *
   * Honest and usually tiny. Recorded because it is the actual probability and
   * an investigation is entitled to it, but it is not what drives the decision.
   */
  posterior: number;
  /**
   * Posterior conditional on something being wrong — `P(H | evidence, ¬NORMAL)`.
   *
   * Sums to 1 across the non-normal hypotheses; zero on `NORMAL` itself. This
   * is the number that distinguishes a medical emergency from a hijacking, and
   * it is what the console should render as "what the system thinks is
   * happening".
   */
  conditional: number;
  /** Signals that most raised this hypothesis, strongest first. */
  supportingSignals: Array<{ signal: string; likelihoodRatio: number }>;
}

// ============================================================================
// Confidence
// ============================================================================

/**
 * How much the engine trusts its own answer.
 *
 * ## Three numbers that are routinely conflated, and must not be
 *
 * - **Probability** — `posterior` on the leading hypothesis. How likely it is
 *   that this explanation is the right one.
 * - **Confidence** — this type. How good the evidence base was. A 3% posterior
 *   from six healthy sensors is a different input to a decision than a 3%
 *   posterior from one degraded camera, even though the number is the same.
 * - **Discrimination** — how clearly the leading hypothesis beat the others. A
 *   posterior of 0.4 that leaves three rivals at 0.2 each is not an answer.
 *
 * Collapsing these into one "confidence" figure, as most systems do, destroys
 * the distinction between "we are sure nothing is wrong" and "we cannot tell".
 * Those demand opposite responses: the first is silence, the second is a human.
 */
export interface DecisionConfidence {
  /** 0-1 composite. The headline epistemic figure. */
  overall: number;

  /** 0-1. Fraction of evidence classes that reported anything. */
  evidenceCoverage: number;
  /** 0-1. Fraction of expected sensors that were healthy and contributing. */
  sensorHealth: number;
  /**
   * 0-1. Trust in the calibration itself.
   *
   * Below 1 whenever the likelihood tables are still the shipped structured
   * estimates rather than numbers fitted to deployment data. This travels with
   * every decision so that an unfitted engine cannot quietly present itself as
   * a fitted one.
   */
  calibrationTrust: number;
  /** 0-1. Whether enough observations arrived to say anything at all. */
  dataSufficiency: number;

  /**
   * 0-1. How peaked the posterior is, from its normalised entropy.
   *
   * 1 means one hypothesis owns the mass. 0 means the engine has learned
   * nothing that separates them — which is a *result*, not a failure, and one
   * an operator needs to see stated rather than inferred from a flat bar chart.
   */
  discrimination: number;

  /** Plain-language reasons the confidence is not higher. */
  limitations: string[];
}

// ============================================================================
// Decision graph
// ============================================================================

/**
 * What a node in the decision graph represents.
 *
 * The graph is the engine's reasoning made traversable. `contributions[]` on a
 * threat score is a flat list — it says which signals mattered but not how they
 * combined, which hypotheses they were weighed against, or where a policy
 * constraint intervened.
 *
 * An investigator asking "why did the system recommend an armed dispatch to a
 * man having a heart attack?" needs the second thing, and needs it from the
 * record rather than from a reconstruction.
 */
export const DecisionNodeKind = {
  /** A raw observation: a signal, an identity band, a sensor state. */
  EVIDENCE: 'EVIDENCE',
  /** A likelihood applied to one hypothesis by one piece of evidence. */
  LIKELIHOOD: 'LIKELIHOOD',
  /** A hypothesis' prior. */
  PRIOR: 'PRIOR',
  /** A hypothesis with its posterior. */
  HYPOTHESIS: 'HYPOTHESIS',
  /** An action the engine considered. */
  ACTION: 'ACTION',
  /**
   * A rule that blocked or downgraded an action.
   *
   * Recorded as a node so the graph shows what was *prevented*, not only what
   * happened. "Immobilisation was considered and blocked by ADR-0007" is a fact
   * about the decision, and a graph that omitted it would imply the option was
   * never on the table.
   */
  CONSTRAINT: 'CONSTRAINT',
  /** The decision that was reached. Exactly one per graph. */
  DECISION: 'DECISION',
} as const;
export type DecisionNodeKind = (typeof DecisionNodeKind)[keyof typeof DecisionNodeKind];

export interface DecisionNode {
  id: string;
  kind: DecisionNodeKind;
  label: string;
  /**
   * The node's numeric value, where it has one: a likelihood ratio, a prior, a
   * posterior. Null on nodes that are purely structural.
   */
  value: number | null;
  /** Evidence class, for evidence and likelihood nodes. */
  evidenceClass: ThreatEvidenceClass | null;
  /** Free-form context. Never load-bearing — anything acted on has a field. */
  detail: Record<string, string | number | boolean | null>;
}

export interface DecisionEdge {
  from: string;
  to: string;
  /**
   * The edge's weight, in log10 likelihood units where applicable.
   *
   * Signed: a negative weight means this evidence argued *against* the target
   * hypothesis. Edges that lower a hypothesis are as important to display as
   * ones that raise it, and a graph showing only support would be a
   * confirmation-bias diagram.
   */
  weight: number | null;
  label: string;
}

/**
 * The reasoning behind one decision, as a directed acyclic graph.
 *
 * Built during inference rather than reconstructed afterwards, so it cannot
 * drift from the arithmetic it describes — the same discipline as
 * `explainAssessment` generating prose from contributions.
 */
export interface DecisionGraph {
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  /** The node id of the decision. Entry point for a reverse traversal. */
  rootNodeId: string;
}

// ============================================================================
// Decisions
// ============================================================================

/**
 * What the engine recommends be done.
 *
 * Note the absence of `IMMOBILISE`. Immobilisation is not a decision this
 * engine can reach — ADR-0007 decision 3, ADR-0008 decision 2 and ADR-0009 all
 * establish that no inference chain ends in stopping a moving vehicle. The
 * option is recorded as a `CONSTRAINT` node when it would otherwise have been
 * considered, so the graph shows it was declined rather than never examined.
 */
export const DecisionAction = {
  /** Record and say nothing. The correct action almost always. */
  NONE: 'NONE',
  /** Watch more closely without surfacing anything. */
  MONITOR: 'MONITOR',
  /** Raise the evidence capture rate. */
  ESCALATE_CAPTURE: 'ESCALATE_CAPTURE',
  /** Put it in front of an operator. */
  NOTIFY_OPERATOR: 'NOTIFY_OPERATOR',
  /** Contact someone by a channel the vehicle cannot observe. */
  CONTACT_OUT_OF_BAND: 'CONTACT_OUT_OF_BAND',
  /** Open an incident. */
  OPEN_INCIDENT: 'OPEN_INCIDENT',
  /** Recommend an armed response. Requires a human to commit it. */
  RECOMMEND_SECURITY_DISPATCH: 'RECOMMEND_SECURITY_DISPATCH',
  /** Recommend an ambulance. Requires a human to commit it. */
  RECOMMEND_MEDICAL_DISPATCH: 'RECOMMEND_MEDICAL_DISPATCH',
  /** Flag the sensor fleet for maintenance. */
  FLAG_MAINTENANCE: 'FLAG_MAINTENANCE',
} as const;
export type DecisionAction = (typeof DecisionAction)[keyof typeof DecisionAction];

/** A constraint that blocked or downgraded an action, and why. */
export interface AppliedConstraint {
  /** Stable identifier, e.g. `NO_AUTONOMOUS_IMMOBILISATION`. */
  code: string;
  /** The action it prevented. */
  blockedAction: string;
  reason: string;
  /** The ADR that establishes it. */
  authority: string;
}

/**
 * The engine's output.
 *
 * Append-only once written. This record may be produced in an investigation —
 * including one into whether the response it recommended was justified — and a
 * mutable one is worth nothing there.
 */
export interface ThreatDecision extends TenantScoped {
  id: UUID;
  vehicleId: UUID | null;
  driverId: UUID | null;

  /**
   * The best non-normal explanation for the evidence.
   *
   * `NORMAL` only when nothing rose above the noise floor. Otherwise this is
   * the leading *conditional* hypothesis — what is happening, if anything is —
   * and `anomalyProbability` says how likely it is that anything is.
   */
  leadingHypothesis: ThreatHypothesis;

  /**
   * `1 − P(NORMAL | evidence)`. How likely it is that anything is wrong at all.
   *
   * Small by construction and honestly so — the base rates are what they are.
   * This is the trigger for acting, and the thresholds it is compared against
   * are **cost-weighted rather than probability-weighted**: a phone call about a
   * possible medical emergency is worth making at well under one percent, and an
   * armed dispatch is not worth making at ten times that.
   */
  anomalyProbability: number;

  /**
   * Conditional posterior of `leadingHypothesis` — `P(H | evidence, ¬NORMAL)`.
   *
   * How clearly this explanation beat the other non-normal ones. Near 1 means
   * the evidence points somewhere specific; near 1/7 means the engine knows
   * something is off and cannot say what, which is a different message and a
   * different response.
   */
  hypothesisConfidence: number;

  /** The full distribution, both absolute and conditional. Never truncated. */
  posteriors: HypothesisPosterior[];

  confidence: DecisionConfidence;

  /** Recommended actions, most significant first. */
  actions: DecisionAction[];
  /** How much latitude the engine has for these actions. */
  autonomyLevel: AutonomyLevel;
  severity: IncidentSeverity;

  /** Constraints that blocked something. Empty is meaningful and common. */
  constraints: AppliedConstraint[];

  /** The reasoning, traversable. */
  graph: DecisionGraph;
  /** Generated from the graph, so prose cannot drift from arithmetic. */
  explanation: string[];

  /** What went in. Recorded so the decision can be replayed exactly. */
  inputs: DecisionInputSummary;

  decidedAt: ISODateString;
  /** Versioned engine. Changing priors changes outcomes; both are recorded. */
  engineVersion: string;
  /** Which likelihood tables were in force. */
  calibrationSource: string;

  /** Set when a human overrode the engine. */
  override: DecisionOverride | null;
}

/**
 * What the decision was computed from.
 *
 * Enough to replay the decision bit-for-bit. A decision that cannot be
 * reproduced from its record cannot be defended, and this one may have to be.
 */
export interface DecisionInputSummary {
  signals: Array<{ signal: BehaviourSignal; strength: number; observedAt: ISODateString }>;
  identityBand: IdentityBand | null;
  identityConfidence: number | null;
  /** Phase 5's hijacking-axis evidence strength, 0-100. */
  threatScore: number | null;
  /** Evidence classes that contributed. */
  evidenceClasses: ThreatEvidenceClass[];
  /** Sensors expected versus healthy. Drives the confidence penalty. */
  sensorsExpected: number;
  sensorsHealthy: number;
}

/**
 * A human overriding the engine.
 *
 * Recorded as first-class data rather than as an audit-log side effect, because
 * disagreement between operators and the engine is the single most valuable
 * calibration signal the platform can collect. An engine that is routinely
 * overridden on the same hypothesis is miscalibrated in a way no offline
 * evaluation will reveal.
 */
export interface DecisionOverride {
  /** What the operator concluded instead. */
  hypothesis: ThreatHypothesis;
  reason: string;
  userId: UUID;
  at: ISODateString;
}

// ============================================================================
// Policy
// ============================================================================

/**
 * What each hypothesis permits, at what probability and confidence.
 *
 * Two constraints are typed as literals so that changing either is a deliberate
 * type change visible in review:
 *
 * `permitAutonomousImmobilisation` — `false` everywhere, consistent with
 * ADR-0007, ADR-0008 and ADR-0009. There is no inference chain in this platform
 * that ends in stopping a moving vehicle.
 *
 * `permitArmedDispatchWithoutHuman` — `false` everywhere. The engine may
 * *recommend* an armed response; committing one is always a person's decision,
 * whatever the posterior says.
 */
export interface HypothesisPolicy {
  hypothesis: ThreatHypothesis;
  /**
   * `anomalyProbability` below which nothing is surfaced.
   *
   * **Cost-weighted, not probability-weighted.** These numbers look alarmingly
   * small next to a conventional "confidence threshold", and that is because
   * they are set by what the action costs rather than by how sure the engine
   * is. A phone call to check on a driver who may be having a stroke is worth
   * making at 0.2%; sending armed responders is not worth making at 2%.
   *
   * Setting these by intuition — "alert above 70%" — would mean the engine
   * never alerts, because against a base rate near one event per 200,000
   * trip-hours nothing ever reaches 70%.
   */
  notifyThreshold: number;
  /** `anomalyProbability` above which an incident is opened. */
  incidentThreshold: number;
  /**
   * Conditional posterior this hypothesis must reach before it is acted on
   * *as this hypothesis*.
   *
   * Stops the engine committing to a specific explanation when several fit
   * equally well. Below it the response falls back to escalating to a human,
   * which is the correct answer to "something is wrong and I cannot tell what".
   */
  minimumConditional: number;
  /**
   * Confidence below which the engine will not act on this hypothesis at all,
   * beyond escalating to a human.
   *
   * A confident wrong answer is worse than an admitted uncertainty, and this is
   * where that principle is enforced numerically.
   */
  minimumConfidence: number;
  actions: DecisionAction[];
  severity: IncidentSeverity;
  autonomyLevel: AutonomyLevel;
  /** Whether anything may be shown inside the vehicle. False under coercion. */
  permitInVehicleFeedback: boolean;

  permitAutonomousImmobilisation: false;
  permitArmedDispatchWithoutHuman: false;

  description: string;
}
