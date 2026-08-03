import {
  AutonomyLevel,
  DecisionAction,
  IncidentSeverity,
  ThreatHypothesis,
  type AppliedConstraint,
  type DecisionConfidence,
  type HypothesisPolicy,
} from '@aegisdrive/types';

/**
 * What each hypothesis permits.
 *
 * ## Three constraints, all typed as literals
 *
 * `permitAutonomousImmobilisation` and `permitArmedDispatchWithoutHuman` are
 * `false` on every row, typed as the literal `false` so that changing either
 * requires a type change visible in review. ADR-0007, ADR-0008 and ADR-0009
 * each established a piece of this; here it is enforced at the point where the
 * platform decides what to *do*.
 *
 * The third is `permitInVehicleFeedback`, false on the coercion hypotheses. An
 * attacker who sees the system react knows the driver triggered something, in
 * front of the driver.
 *
 * ## Why every threat row needs a minimum confidence
 *
 * Because a confident wrong answer is worse than an admitted uncertainty, and
 * this is where that becomes arithmetic rather than sentiment. Below the
 * threshold the engine will not act on a hypothesis at all beyond escalating to
 * a human — however high the posterior climbs.
 *
 * A posterior of 0.9 for hijacking built on one degraded camera is exactly the
 * output that should not dispatch anyone, and it is the output a system without
 * this rule would dispatch on hardest.
 */

export const DECISION_POLICY_VERSION = 'decision-policy-v1' as const;

export const HYPOTHESIS_POLICIES: Readonly<Record<ThreatHypothesis, HypothesisPolicy>> =
  Object.freeze({
    [ThreatHypothesis.NORMAL]: {
      hypothesis: ThreatHypothesis.NORMAL,
      notifyThreshold: 2,
      incidentThreshold: 2,
      minimumConditional: 2,
      minimumConfidence: 0,
      actions: [DecisionAction.NONE],
      severity: IncidentSeverity.INFO,
      autonomyLevel: AutonomyLevel.AUTONOMOUS,
      permitInVehicleFeedback: true,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      // Thresholds above 1 are unreachable by a probability, which is the
      // intent: normal operation can never trigger anything.
      description: 'Nothing is wrong. The decision is recorded and nothing is surfaced.',
    },

    [ThreatHypothesis.SENSOR_FAILURE]: {
      hypothesis: ThreatHypothesis.SENSOR_FAILURE,
      notifyThreshold: 0.02,
      incidentThreshold: 2,
      minimumConditional: 0.35,
      minimumConfidence: 0,
      actions: [DecisionAction.FLAG_MAINTENANCE],
      severity: IncidentSeverity.LOW,
      autonomyLevel: AutonomyLevel.AUTONOMOUS,
      permitInVehicleFeedback: true,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      description:
        'The evidence is best explained by faulty sensors. Raised as maintenance, not as a threat. No incident is opened and nobody is dispatched.',
    },

    [ThreatHypothesis.UNAUTHORISED_USE]: {
      hypothesis: ThreatHypothesis.UNAUTHORISED_USE,
      notifyThreshold: 0.002,
      incidentThreshold: 2,
      minimumConditional: 0.35,
      minimumConfidence: 0.3,
      actions: [DecisionAction.NOTIFY_OPERATOR, DecisionAction.ESCALATE_CAPTURE],
      severity: IncidentSeverity.LOW,
      autonomyLevel: AutonomyLevel.ADVISORY,
      permitInVehicleFeedback: true,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      // No incident threshold below 1: an unlogged relief driver is an
      // administrative matter. Opening incidents on it would bury the control
      // room and teach operators that identity alerts mean nothing.
      description:
        'Someone other than the enrolled driver is driving, with no sign of coercion. Almost always a colleague or a relief shift. An operator is informed; no incident is opened.',
    },

    [ThreatHypothesis.COLLISION]: {
      hypothesis: ThreatHypothesis.COLLISION,
      notifyThreshold: 0.001,
      incidentThreshold: 0.005,
      minimumConditional: 0.3,
      minimumConfidence: 0.25,
      actions: [
        DecisionAction.NOTIFY_OPERATOR,
        DecisionAction.OPEN_INCIDENT,
        DecisionAction.RECOMMEND_MEDICAL_DISPATCH,
        DecisionAction.ESCALATE_CAPTURE,
      ],
      severity: IncidentSeverity.HIGH,
      autonomyLevel: AutonomyLevel.SUPERVISED,
      // A collision is not a coercion scenario. Contacting the cabin is the
      // right first move, not a risk.
      permitInVehicleFeedback: true,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      description:
        'A collision. An incident is opened and a medical response is recommended. Contacting the vehicle directly is appropriate here.',
    },

    [ThreatHypothesis.MEDICAL]: {
      hypothesis: ThreatHypothesis.MEDICAL,
      // The lowest thresholds in the table, and deliberately so. A missed
      // stroke costs a life; a false medical alarm costs a phone call. The
      // asymmetry runs the opposite way to every threat hypothesis, and the
      // numbers should say so.
      notifyThreshold: 0.0005,
      incidentThreshold: 0.004,
      minimumConditional: 0.25,
      minimumConfidence: 0.2,
      actions: [
        DecisionAction.NOTIFY_OPERATOR,
        DecisionAction.CONTACT_OUT_OF_BAND,
        DecisionAction.OPEN_INCIDENT,
        DecisionAction.RECOMMEND_MEDICAL_DISPATCH,
        DecisionAction.ESCALATE_CAPTURE,
      ],
      severity: IncidentSeverity.CRITICAL,
      autonomyLevel: AutonomyLevel.SUPERVISED,
      permitInVehicleFeedback: true,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      description:
        'The driver appears incapacitated. An ambulance is recommended, not a security response. Contacting the vehicle is appropriate and urgent.',
    },

    [ThreatHypothesis.THEFT]: {
      hypothesis: ThreatHypothesis.THEFT,
      notifyThreshold: 0.001,
      incidentThreshold: 0.008,
      minimumConditional: 0.35,
      minimumConfidence: 0.4,
      actions: [
        DecisionAction.NOTIFY_OPERATOR,
        DecisionAction.OPEN_INCIDENT,
        DecisionAction.ESCALATE_CAPTURE,
        DecisionAction.RECOMMEND_SECURITY_DISPATCH,
      ],
      severity: IncidentSeverity.HIGH,
      autonomyLevel: AutonomyLevel.SUPERVISED,
      // No driver aboard to endanger, so in-vehicle feedback carries no risk to
      // a victim. Whether to alert the thief is an operator's tactical call.
      permitInVehicleFeedback: true,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      description:
        'The vehicle appears to be taken with no driver aboard. An incident is opened and a security response is recommended for a human to commit.',
    },

    [ThreatHypothesis.DURESS]: {
      hypothesis: ThreatHypothesis.DURESS,
      notifyThreshold: 0.001,
      incidentThreshold: 0.006,
      minimumConditional: 0.3,
      minimumConfidence: 0.35,
      actions: [
        DecisionAction.NOTIFY_OPERATOR,
        DecisionAction.CONTACT_OUT_OF_BAND,
        DecisionAction.OPEN_INCIDENT,
        DecisionAction.ESCALATE_CAPTURE,
      ],
      severity: IncidentSeverity.CRITICAL,
      autonomyLevel: AutonomyLevel.SUPERVISED,
      // Nothing may reach the cabin.
      permitInVehicleFeedback: false,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      description:
        'A person in the vehicle appears to be under coercion. Handled covertly: nothing is shown in the cabin, and contact must be made by a channel the vehicle cannot observe.',
    },

    [ThreatHypothesis.HIJACKING]: {
      hypothesis: ThreatHypothesis.HIJACKING,
      notifyThreshold: 0.001,
      incidentThreshold: 0.006,
      minimumConditional: 0.3,
      minimumConfidence: 0.35,
      actions: [
        DecisionAction.NOTIFY_OPERATOR,
        DecisionAction.CONTACT_OUT_OF_BAND,
        DecisionAction.OPEN_INCIDENT,
        DecisionAction.ESCALATE_CAPTURE,
        DecisionAction.RECOMMEND_SECURITY_DISPATCH,
      ],
      severity: IncidentSeverity.CRITICAL,
      autonomyLevel: AutonomyLevel.SUPERVISED,
      permitInVehicleFeedback: false,
      permitAutonomousImmobilisation: false,
      permitArmedDispatchWithoutHuman: false,
      description:
        'A hijacking appears to be in progress with the driver aboard. Handled covertly. An armed response is recommended and requires a human to commit it.',
    },
  });

export function hypothesisPolicyFor(hypothesis: ThreatHypothesis): HypothesisPolicy {
  return HYPOTHESIS_POLICIES[hypothesis];
}

export interface ResolvedDecision {
  actions: DecisionAction[];
  severity: IncidentSeverity;
  autonomyLevel: AutonomyLevel;
  constraints: AppliedConstraint[];
  permitInVehicleFeedback: boolean;
}

/**
 * Resolves a hypothesis, its probability and the confidence into actions.
 *
 * Constraints are returned rather than silently applied. A decision record that
 * showed only what happened would imply the blocked options were never on the
 * table, and an investigator asking "was immobilisation considered?" deserves
 * an answer from the record.
 */
export function resolveDecision(
  hypothesis: ThreatHypothesis,
  /** `1 − P(NORMAL)`. How likely it is that anything is wrong. */
  anomalyProbability: number,
  /** `P(H | ¬NORMAL)`. How clearly this explanation beat the other non-normal ones. */
  hypothesisConfidence: number,
  confidence: DecisionConfidence,
): ResolvedDecision {
  const policy = hypothesisPolicyFor(hypothesis);
  const constraints: AppliedConstraint[] = [];
  const probability = anomalyProbability;

  // Immobilisation is never available. Recorded on every threat hypothesis so
  // the graph shows the option was examined and declined, rather than absent.
  if (isThreat(hypothesis)) {
    constraints.push({
      code: 'NO_AUTONOMOUS_IMMOBILISATION',
      blockedAction: 'IMMOBILISE',
      reason:
        'No inference chain in this platform ends in stopping a moving vehicle. Face and behaviour models have demographically uneven error rates, and immobilising on a highway can kill someone. Immobilisation requires an operator holding vehicle:immobilise, acting on corroborating evidence they have seen.',
      authority: 'ADR-0007 decision 3',
    });
  }

  if (probability < policy.notifyThreshold) {
    return {
      actions: [DecisionAction.NONE],
      severity: IncidentSeverity.INFO,
      autonomyLevel: AutonomyLevel.AUTONOMOUS,
      constraints,
      permitInVehicleFeedback: policy.permitInVehicleFeedback,
    };
  }

  // The conditional gate. Something is wrong, but the evidence does not point
  // clearly enough at *this* explanation to act on it as this explanation.
  //
  // Escalating to a human is the correct response to "something is off and I
  // cannot tell what" — and it is a genuinely different answer from either an
  // all-clear or a confident finding, so it gets its own branch rather than
  // being rounded to one of them.
  if (hypothesisConfidence < policy.minimumConditional) {
    constraints.push({
      code: 'AMBIGUOUS_EXPLANATION',
      blockedAction: policy.actions.join(', '),
      reason:
        `The leading explanation (${hypothesis}) holds only ${(hypothesisConfidence * 100).toFixed(0)}% of the non-normal posterior, ` +
        `below the ${(policy.minimumConditional * 100).toFixed(0)}% needed to act on it specifically. ` +
        `Several explanations fit the evidence about equally well, so the response is to put a human on it rather than to commit to one.`,
      authority: 'ADR-0010 decision 6',
    });

    return {
      actions: [DecisionAction.NOTIFY_OPERATOR, DecisionAction.ESCALATE_CAPTURE],
      severity: IncidentSeverity.MEDIUM,
      autonomyLevel: AutonomyLevel.ADVISORY,
      constraints,
      permitInVehicleFeedback: policy.permitInVehicleFeedback,
    };
  }

  // The confidence gate. Below it the engine escalates to a human and does
  // nothing else — no incident, no dispatch recommendation, whatever the
  // posterior says.
  if (confidence.overall < policy.minimumConfidence) {
    constraints.push({
      code: 'INSUFFICIENT_CONFIDENCE',
      blockedAction: policy.actions.join(', '),
      reason:
        `Confidence ${confidence.overall.toFixed(2)} is below the ${policy.minimumConfidence} minimum for ${hypothesis}. ` +
        `The posterior of ${(probability * 100).toFixed(0)}% rests on evidence too thin to act on: ` +
        `${confidence.limitations[0] ?? 'insufficient evidence quality'} ` +
        `A confident-looking answer built on a degraded sensor suite is the output that should not dispatch anyone.`,
      authority: 'ADR-0010 decision 4',
    });

    return {
      actions: [DecisionAction.NOTIFY_OPERATOR, DecisionAction.ESCALATE_CAPTURE],
      severity: IncidentSeverity.MEDIUM,
      autonomyLevel: AutonomyLevel.ADVISORY,
      constraints,
      permitInVehicleFeedback: policy.permitInVehicleFeedback,
    };
  }

  const actions = policy.actions.filter((action) => {
    if (action === DecisionAction.OPEN_INCIDENT) {
      return probability >= policy.incidentThreshold;
    }
    return true;
  });

  // A dispatch recommendation is held back until the incident threshold is
  // cleared too. Recommending armed responders on a posterior that did not
  // justify opening an incident is incoherent, and the console would render the
  // recommendation as the headline.
  const withheldDispatch =
    probability < policy.incidentThreshold &&
    policy.actions.includes(DecisionAction.RECOMMEND_SECURITY_DISPATCH);

  const finalActions = withheldDispatch
    ? actions.filter((action) => action !== DecisionAction.RECOMMEND_SECURITY_DISPATCH)
    : actions;

  if (withheldDispatch) {
    constraints.push({
      code: 'DISPATCH_BELOW_INCIDENT_THRESHOLD',
      blockedAction: DecisionAction.RECOMMEND_SECURITY_DISPATCH,
      reason: `Posterior ${(probability * 100).toFixed(0)}% is below the ${(policy.incidentThreshold * 100).toFixed(0)}% at which an incident would be opened. An armed-response recommendation on evidence that did not justify an incident would be read as the headline finding.`,
      authority: 'ADR-0010 decision 5',
    });
  }

  return {
    actions: finalActions,
    severity: policy.severity,
    autonomyLevel: policy.autonomyLevel,
    constraints,
    permitInVehicleFeedback: policy.permitInVehicleFeedback,
  };
}

function isThreat(hypothesis: ThreatHypothesis): boolean {
  return (
    hypothesis === ThreatHypothesis.HIJACKING ||
    hypothesis === ThreatHypothesis.THEFT ||
    hypothesis === ThreatHypothesis.DURESS
  );
}
