import {
  DecisionNodeKind,
  ThreatHypothesis,
  type AppliedConstraint,
  type BehaviourObservation,
  type DecisionAction,
  type DecisionEdge,
  type DecisionGraph,
  type DecisionNode,
  type HypothesisPosterior,
  type IdentityBand,
} from '@aegisdrive/types';
import { SIGNAL_CALIBRATION } from '../behaviour/catalogue';
import { HYPOTHESIS_LABEL } from './hypotheses';

/**
 * The AI decision graph.
 *
 * ## What it is for
 *
 * `contributions[]` on a threat score is a flat list. It says which signals
 * mattered, but not how they combined, which explanations they were weighed
 * against, or where a policy rule intervened.
 *
 * An investigator asking *"why did this system recommend an armed dispatch to a
 * man having a heart attack?"* needs the second thing, and needs it from the
 * record rather than from a reconstruction someone builds afterwards from logs.
 *
 * The graph answers that question by construction. Every hypothesis that was
 * considered appears, including the ones that lost; every piece of evidence
 * appears with a signed edge to each hypothesis it moved; and every constraint
 * that blocked an action appears as a node, so the graph shows what was
 * *prevented* rather than only what happened.
 *
 * ## Built during inference, never reconstructed
 *
 * Same discipline as `explainAssessment` generating prose from contributions.
 * A graph assembled afterwards from the same inputs is a second implementation
 * of the reasoning, and the two will diverge — usually at the moment someone is
 * relying on the graph to explain a decision they are being asked about.
 */

export const GRAPH_VERSION = 'decision-graph-v1' as const;

/** Edges below this absolute weight are omitted. Keeps the graph readable. */
const EDGE_WEIGHT_FLOOR = 0.02;

export interface GraphInput {
  observations: readonly BehaviourObservation[];
  identityBand: IdentityBand | null;
  posteriors: readonly HypothesisPosterior[];
  leading: HypothesisPosterior;
  actions: readonly DecisionAction[];
  constraints: readonly AppliedConstraint[];
  confidenceOverall: number;
}

export function buildGraph(input: GraphInput): DecisionGraph {
  const nodes: DecisionNode[] = [];
  const edges: DecisionEdge[] = [];

  // ------------------------------------------------------------- evidence
  const evidenceNodeIds = new Map<string, string>();

  for (const observation of input.observations) {
    const calibration = SIGNAL_CALIBRATION[observation.signal];
    if (!calibration) continue;

    const id = `evidence:${observation.signal}`;
    if (evidenceNodeIds.has(observation.signal)) continue;

    evidenceNodeIds.set(observation.signal, id);
    nodes.push({
      id,
      kind: DecisionNodeKind.EVIDENCE,
      label: calibration.description,
      value: observation.strength,
      evidenceClass: calibration.evidenceClass,
      detail: {
        signal: observation.signal,
        detectorConfidence: observation.detectorConfidence,
        quality: observation.quality,
        durationSeconds: observation.durationSeconds,
        observedAt: observation.observedAt,
        modelId: observation.modelId,
      },
    });
  }

  if (input.identityBand) {
    const id = `evidence:IDENTITY_${input.identityBand}`;
    evidenceNodeIds.set(`IDENTITY_${input.identityBand}`, id);

    nodes.push({
      id,
      kind: DecisionNodeKind.EVIDENCE,
      label: `Driver identity assessed as ${input.identityBand.toLowerCase()}`,
      value: null,
      evidenceClass: null,
      detail: { band: input.identityBand },
    });
  }

  // ----------------------------------------------------------- hypotheses
  //
  // Every hypothesis is emitted, including the ones that lost badly. A graph
  // showing only the winner would be a justification rather than a record, and
  // the losing posteriors are how a reviewer sees what else was on the table.
  for (const posterior of input.posteriors) {
    const priorId = `prior:${posterior.hypothesis}`;
    const hypothesisId = `hypothesis:${posterior.hypothesis}`;

    nodes.push({
      id: priorId,
      kind: DecisionNodeKind.PRIOR,
      label: `Prior: ${HYPOTHESIS_LABEL[posterior.hypothesis]}`,
      value: posterior.prior,
      evidenceClass: null,
      detail: { hypothesis: posterior.hypothesis },
    });

    nodes.push({
      id: hypothesisId,
      kind: DecisionNodeKind.HYPOTHESIS,
      label: HYPOTHESIS_LABEL[posterior.hypothesis],
      value: posterior.posterior,
      evidenceClass: null,
      detail: {
        hypothesis: posterior.hypothesis,
        logLikelihood: posterior.logLikelihood,
        leading: posterior.hypothesis === input.leading.hypothesis,
      },
    });

    edges.push({
      from: priorId,
      to: hypothesisId,
      weight: Math.log10(Math.max(1e-12, posterior.prior)),
      label: 'prior',
    });

    // Evidence → hypothesis edges, signed. An edge that *lowered* a hypothesis
    // is as important to display as one that raised it; a graph showing only
    // support would be a confirmation-bias diagram.
    for (const support of posterior.supportingSignals) {
      const evidenceId = evidenceNodeIds.get(support.signal);
      if (!evidenceId) continue;

      const weight = Math.log10(Math.max(1e-6, support.likelihoodRatio));
      if (Math.abs(weight) < EDGE_WEIGHT_FLOOR) continue;

      edges.push({
        from: evidenceId,
        to: hypothesisId,
        weight: round3(weight),
        label:
          weight > 0
            ? `raises ×${support.likelihoodRatio.toFixed(1)}`
            : `lowers ×${(1 / support.likelihoodRatio).toFixed(1)}`,
      });
    }
  }

  // ----------------------------------------------------------- constraints
  for (const [index, constraint] of input.constraints.entries()) {
    const id = `constraint:${constraint.code}:${index}`;

    nodes.push({
      id,
      kind: DecisionNodeKind.CONSTRAINT,
      label: `${constraint.code} blocked ${constraint.blockedAction}`,
      value: null,
      evidenceClass: null,
      detail: {
        code: constraint.code,
        blockedAction: constraint.blockedAction,
        authority: constraint.authority,
        reason: constraint.reason,
      },
    });

    edges.push({
      from: `hypothesis:${input.leading.hypothesis}`,
      to: id,
      weight: null,
      label: 'constrained by',
    });
  }

  // --------------------------------------------------------------- actions
  for (const action of input.actions) {
    const id = `action:${action}`;

    nodes.push({
      id,
      kind: DecisionNodeKind.ACTION,
      label: action,
      value: null,
      evidenceClass: null,
      detail: { action },
    });

    edges.push({
      from: `hypothesis:${input.leading.hypothesis}`,
      to: id,
      weight: null,
      label: 'permits',
    });
  }

  // -------------------------------------------------------------- decision
  const decisionId = 'decision:root';

  nodes.push({
    id: decisionId,
    kind: DecisionNodeKind.DECISION,
    label: `${HYPOTHESIS_LABEL[input.leading.hypothesis]} at ${(input.leading.conditional * 100).toFixed(1)}% of the non-normal posterior`,
    value: input.leading.conditional,
    evidenceClass: null,
    detail: {
      hypothesis: input.leading.hypothesis,
      confidence: input.confidenceOverall,
      actionCount: input.actions.length,
      constraintCount: input.constraints.length,
    },
  });

  for (const action of input.actions) {
    edges.push({ from: `action:${action}`, to: decisionId, weight: null, label: 'decided' });
  }

  // A decision with no actions still needs an edge into the root, or the graph
  // has no path from the hypothesis to its conclusion and a reverse traversal
  // finds nothing. "Nothing was done" is a decision and must be traversable.
  if (input.actions.length === 0) {
    edges.push({
      from: `hypothesis:${input.leading.hypothesis}`,
      to: decisionId,
      weight: null,
      label: 'decided',
    });
  }

  return { nodes, edges, rootNodeId: decisionId };
}

/**
 * Plain-language explanation, generated from the graph.
 *
 * Reads the same structure the console renders, so the prose and the diagram
 * cannot disagree. The rejected hypotheses are included on purpose: "this is a
 * medical emergency, not a hijacking" is more useful to an operator than "this
 * is a medical emergency", because it tells them what the system ruled out and
 * lets them disagree with the ruling.
 */
export function explainGraph(
  graph: DecisionGraph,
  posteriors: readonly HypothesisPosterior[],
  confidenceOverall: number,
  constraints: readonly AppliedConstraint[],
): string[] {
  const lines: string[] = [];

  const normal = posteriors.find((entry) => entry.hypothesis === ThreatHypothesis.NORMAL);
  const anomalyProbability = 1 - (normal?.posterior ?? 1);

  const nonNormal = [...posteriors]
    .filter((entry) => entry.hypothesis !== ThreatHypothesis.NORMAL)
    .sort((a, b) => b.conditional - a.conditional);

  const leading = nonNormal[0];
  if (!leading) return ['No hypothesis could be evaluated.'];

  // Both numbers, in the order an operator asks the questions. Leading with the
  // conditional alone would overstate — "medical emergency, 71%" reads as a
  // finding when the chance anything is wrong at all is under one percent.
  lines.push(
    `Probability that anything is wrong: ${(anomalyProbability * 100).toFixed(2)}%. ` +
      `This is low on almost every trip and that is correct — the base rates are what they are.`,
  );
  lines.push(
    `If something is wrong, the best explanation is ${HYPOTHESIS_LABEL[leading.hypothesis]} ` +
      `(${(leading.conditional * 100).toFixed(0)}% of the non-normal posterior).`,
  );

  const runnerUp = nonNormal[1];
  if (runnerUp && runnerUp.conditional > 0.05) {
    lines.push(
      `Next best: ${HYPOTHESIS_LABEL[runnerUp.hypothesis]} at ${(runnerUp.conditional * 100).toFixed(0)}%.`,
    );
  }

  const drivers = graph.edges
    .filter((edge) => edge.to === `hypothesis:${leading.hypothesis}` && (edge.weight ?? 0) > 0)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 5);

  for (const edge of drivers) {
    const node = graph.nodes.find((entry) => entry.id === edge.from);
    if (!node) continue;
    lines.push(`  ${node.label} — ${edge.label}.`);
  }

  const against = graph.edges
    .filter((edge) => edge.to === `hypothesis:${leading.hypothesis}` && (edge.weight ?? 0) < 0)
    .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
    .slice(0, 3);

  for (const edge of against) {
    const node = graph.nodes.find((entry) => entry.id === edge.from);
    if (!node) continue;
    lines.push(`  ${node.label} — ${edge.label}, arguing against this explanation.`);
  }

  // Stated on every explanation, not only the uncertain ones. The caveat is
  // least likely to be read at the moment it matters most.
  lines.push(
    `Confidence in this assessment: ${(confidenceOverall * 100).toFixed(0)}%. This is how good the evidence was, not how likely the explanation is — the two are separate and both are shown.`,
  );

  for (const constraint of constraints) {
    lines.push(
      `Blocked: ${constraint.blockedAction} — ${constraint.reason} (${constraint.authority})`,
    );
  }

  if (leading.hypothesis === ThreatHypothesis.SENSOR_FAILURE) {
    lines.push(
      'Treated as a maintenance matter rather than a threat. Sensors fail far more often than vehicles are attacked, and this evidence pattern fits a fault better than an event.',
    );
  }

  return lines;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
