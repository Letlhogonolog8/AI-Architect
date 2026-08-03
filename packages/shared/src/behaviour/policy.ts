import {
  IncidentSeverity,
  ThreatLevel,
  type BehaviourPolicy,
  type DuressAssessment,
  type ThreatScore,
} from '@aegisdrive/types';

/**
 * What the platform may do at each threat level.
 *
 * ## Three constraints this file exists to enforce
 *
 * **1. The engine never speaks to the cabin.** `notifyDriver` is `false` at
 * every level, and unlike the other flags it is false even at `MINIMAL`.
 *
 * If duress is plausible, an in-vehicle reaction tells an attacker the system
 * has noticed — in front of the person it is protecting. And if duress is not
 * plausible, the only thing left to say to the driver is some version of "you
 * seem agitated", which is the workplace-surveillance failure mode this engine
 * is built to avoid. There is no threat level at which talking to the cabin is
 * the right move, so the flag exists to make that absence explicit rather than
 * an oversight.
 *
 * **2. `permitAutonomousImmobilisation` is `false` everywhere**, typed as the
 * literal. ADR-0007 established that identity evidence never justifies stopping
 * a moving vehicle. Behaviour evidence is *weaker* than identity evidence — its
 * likelihood ratios are smaller and its detectors less reliable — so if
 * identity cannot immobilise, this certainly cannot.
 *
 * **3. `permitPerformanceManagement` is `false` everywhere**, also typed as the
 * literal. The lawful basis for processing these signals is the safety of the
 * data subject. Reusing them to rank, coach or discipline drivers would convert
 * a safety system into worker monitoring and forfeit that basis entirely — and
 * under the EU AI Act, inferring emotional state from workers outside a safety
 * purpose is a prohibited practice, not merely a regulated one.
 *
 * The strongest automated response available here is the same as everywhere
 * else in this platform: **raising it to a human**.
 */

export const BEHAVIOUR_POLICY_VERSION = 'behaviour-policy-v1' as const;

export const BEHAVIOUR_POLICIES: Readonly<Record<ThreatLevel, BehaviourPolicy>> = Object.freeze({
  [ThreatLevel.MINIMAL]: {
    level: ThreatLevel.MINIMAL,
    raiseAlert: false,
    alertSeverity: null,
    openIncident: false,
    escalateCapture: false,
    silentMonitoring: false,
    notifyDriver: false,
    recommendExternalContact: false,
    permitAutonomousImmobilisation: false,
    permitPerformanceManagement: false,
    description: 'Nothing of note. The assessment is recorded and nothing is surfaced.',
  },

  [ThreatLevel.GUARDED]: {
    level: ThreatLevel.GUARDED,
    raiseAlert: false,
    alertSeverity: null,
    openIncident: false,
    escalateCapture: false,
    silentMonitoring: false,
    notifyDriver: false,
    recommendExternalContact: false,
    description:
      'Some signal above baseline, well within what ordinary driving produces. Recorded, not surfaced — alerting here would bury the control room in traffic and arguments.',
    permitAutonomousImmobilisation: false,
    permitPerformanceManagement: false,
  },

  [ThreatLevel.ELEVATED]: {
    level: ThreatLevel.ELEVATED,
    raiseAlert: false,
    alertSeverity: null,
    openIncident: false,
    // Capture increases before anyone is alerted. If this turns into an
    // incident, the minutes leading up to it are the ones that matter, and they
    // cannot be recovered retrospectively.
    escalateCapture: true,
    silentMonitoring: true,
    notifyDriver: false,
    recommendExternalContact: false,
    permitAutonomousImmobilisation: false,
    permitPerformanceManagement: false,
    description:
      'Enough signal to watch. The vehicle joins the control-room watch list and evidence capture increases. No alert is raised and nothing is shown to the driver.',
  },

  [ThreatLevel.HIGH]: {
    level: ThreatLevel.HIGH,
    raiseAlert: true,
    alertSeverity: IncidentSeverity.HIGH,
    // Still no automatic incident. At this level the evidence usually has a
    // mundane explanation, and an operator who can see the vehicle and its
    // history decides — not the scorer.
    openIncident: false,
    escalateCapture: true,
    silentMonitoring: true,
    notifyDriver: false,
    recommendExternalContact: true,
    permitAutonomousImmobilisation: false,
    permitPerformanceManagement: false,
    description:
      'Corroborated evidence across independent classes. An operator is alerted and should make contact by a channel outside the vehicle. No incident is opened automatically.',
  },

  [ThreatLevel.SEVERE]: {
    level: ThreatLevel.SEVERE,
    raiseAlert: true,
    alertSeverity: IncidentSeverity.CRITICAL,
    openIncident: true,
    escalateCapture: true,
    silentMonitoring: true,
    notifyDriver: false,
    recommendExternalContact: true,
    permitAutonomousImmobilisation: false,
    permitPerformanceManagement: false,
    description:
      'Strong corroborated evidence, or a deliberate duress signal from the driver. An incident is opened and the control room is alerted at critical severity. Immobilisation and dispatch remain operator decisions.',
  },
});

export function behaviourPolicyFor(level: ThreatLevel): BehaviourPolicy {
  return BEHAVIOUR_POLICIES[level];
}

/**
 * Folds duress into the level's base policy.
 *
 * Duress can only ever **escalate**, never de-escalate. A cabin that looks calm
 * says very little: a driver with a gun in their ribs has every reason to sit
 * still and stay quiet, and treating that stillness as reassurance inverts the
 * signal exactly when it counts.
 *
 * A deliberate duress signal — the driver choosing to speak their phrase —
 * escalates straight to the severe policy regardless of what the score says.
 * That is testimony from the person in the vehicle, and no combination of
 * sensor readings outranks it.
 */
export function effectiveBehaviourPolicy(
  threat: ThreatScore,
  duress: DuressAssessment | null,
): BehaviourPolicy {
  const base = behaviourPolicyFor(threat.level);

  if (!duress?.indicated) return base;

  if (duress.deliberateSignal) {
    return {
      ...BEHAVIOUR_POLICIES[ThreatLevel.SEVERE],
      description:
        'The driver deliberately signalled duress. Treated as severe regardless of the sensor evidence, and handled covertly: nothing is shown in the vehicle, and contact must be made by a channel the vehicle cannot observe.',
    };
  }

  return {
    ...base,
    raiseAlert: true,
    alertSeverity:
      base.alertSeverity === IncidentSeverity.CRITICAL
        ? IncidentSeverity.CRITICAL
        : IncidentSeverity.HIGH,
    escalateCapture: true,
    silentMonitoring: true,
    notifyDriver: false,
    recommendExternalContact: true,
    description: `${base.description} Escalated: the evidence pattern is consistent with the driver acting under coercion, so all handling is covert.`,
  };
}

/**
 * Whether an assessment may be included in driver-facing analytics.
 *
 * Always `false`, and it is a function rather than a constant so that every
 * call site has to ask, and so the reason travels with the answer at the point
 * someone is trying to build a driver scorecard out of this data.
 *
 * The exports that *are* legitimate are aggregate and de-identified: model
 * quality monitoring, demographic-parity auditing, and false-positive rate
 * review. None of those needs a named driver attached, and the moment one does,
 * it has stopped being safety work.
 */
export function permittedInDriverAnalytics(): { permitted: false; reason: string } {
  return {
    permitted: false,
    reason:
      'Behaviour intelligence signals are processed on a safety basis for the protection of the data subject. Using them for driver performance management, ranking or discipline is outside that basis and is a prohibited practice under the EU AI Act. Aggregate, de-identified model-quality reporting is the only permitted secondary use.',
  };
}
