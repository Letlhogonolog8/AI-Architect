import {
  EmergencyChannel,
  IncidentSeverity,
  IncidentType,
  SosActivationMethod,
} from '@aegisdrive/types';

/**
 * The response policy of the Silent Emergency Engine.
 *
 * The judgement that turns a raw activation into a fan-out lives here, in
 * reviewable code, rather than in the request handler or a vendor SDK: which
 * parties an emergency reaches, how a repeat is collapsed, and the invariants
 * that keep the whole thing covert.
 */

/**
 * Always covert. Typed as the literal `true` so that any code path claiming to
 * raise a non-covert SOS is a compile error, not a config flag. A non-covert
 * emergency — one the vehicle is told about — is a different product with a
 * different threat model, and building it would be the change to argue about.
 */
export const SOS_IS_ALWAYS_COVERT: true = true;

/**
 * How long a fresh activation from the same vehicle is treated as the same
 * emergency rather than a new one.
 *
 * A driver being hijacked may hit the button repeatedly, and the dead-man and
 * app paths can both fire within seconds of each other. Ten dispatches to the
 * police for one event is how a real alarm gets ignored as a malfunction, so
 * repeats inside this window fold into the open activation instead of opening
 * another. The window is short because two genuinely separate emergencies on one
 * vehicle minutes apart must still both be raised.
 */
export const SOS_DEDUPE_WINDOW_SECONDS = 120;

/**
 * How long a dead-man liveness check waits for a stand-down before it fires.
 *
 * Long enough that an ordinary lapse — a driver who set their phone down — does
 * not cry wolf; short enough that it is still useful for a driver who cannot
 * answer because someone is stopping them. The engine records the value on the
 * activation so a fired dead-man can be explained after the fact.
 */
export const DEADMAN_TIMEOUT_SECONDS = 90;

/**
 * The channels an activation fans out to, by method.
 *
 * Two ideas are encoded here. First, a human-triggered silent SOS is the
 * strongest signal the platform has that a person is in danger, so it reaches
 * everyone who can act. Second, an automatic `DECISION_ENGINE` activation is a
 * probability, not a person, and it deliberately does **not** reach the family
 * or the insurer on its own: a false positive that phones a driver's spouse to
 * say they are being hijacked, or opens an insurance claim, causes real harm.
 * The engine's automatic path reaches the responders who can quietly verify —
 * police and security — and leaves the family and insurer to an operator who has
 * looked.
 */
const CHANNELS_BY_METHOD: Record<SosActivationMethod, readonly EmergencyChannel[]> = {
  [SosActivationMethod.HIDDEN_BUTTON]: [
    EmergencyChannel.POLICE,
    EmergencyChannel.PRIVATE_SECURITY,
    EmergencyChannel.FAMILY,
    EmergencyChannel.INSURANCE,
  ],
  [SosActivationMethod.DURESS_PIN]: [
    EmergencyChannel.POLICE,
    EmergencyChannel.PRIVATE_SECURITY,
    EmergencyChannel.FAMILY,
    EmergencyChannel.INSURANCE,
  ],
  [SosActivationMethod.DURESS_PHRASE]: [
    EmergencyChannel.POLICE,
    EmergencyChannel.PRIVATE_SECURITY,
    EmergencyChannel.FAMILY,
    EmergencyChannel.INSURANCE,
  ],
  [SosActivationMethod.POWER_BUTTON_SEQUENCE]: [
    EmergencyChannel.POLICE,
    EmergencyChannel.PRIVATE_SECURITY,
    EmergencyChannel.FAMILY,
    EmergencyChannel.INSURANCE,
  ],
  [SosActivationMethod.APP_GESTURE]: [
    EmergencyChannel.POLICE,
    EmergencyChannel.PRIVATE_SECURITY,
    EmergencyChannel.FAMILY,
    EmergencyChannel.INSURANCE,
  ],
  [SosActivationMethod.WEARABLE]: [
    EmergencyChannel.POLICE,
    EmergencyChannel.PRIVATE_SECURITY,
    EmergencyChannel.FAMILY,
    EmergencyChannel.INSURANCE,
  ],
  // Automatic paths verify before they alarm the family or the insurer.
  [SosActivationMethod.DEADMAN]: [EmergencyChannel.PRIVATE_SECURITY, EmergencyChannel.POLICE],
  [SosActivationMethod.DECISION_ENGINE]: [
    EmergencyChannel.PRIVATE_SECURITY,
    EmergencyChannel.POLICE,
  ],
};

/** The channels a given activation method fans out to on first raise. */
export function channelsForActivation(method: SosActivationMethod): readonly EmergencyChannel[] {
  return CHANNELS_BY_METHOD[method];
}

/** Whether a method was triggered by a person rather than by the platform. */
export function isHumanTriggered(method: SosActivationMethod): boolean {
  return method !== SosActivationMethod.DECISION_ENGINE && method !== SosActivationMethod.DEADMAN;
}

/**
 * The incident a silent SOS opens.
 *
 * Always CRITICAL. A person deliberately and covertly summoning help is the top
 * of the severity ladder — the cost of treating a genuine hijacking as routine
 * is not symmetric with the cost of an operator standing down a false one, and
 * the engine resolves that asymmetry in favour of the person in the car. A
 * `DECISION_ENGINE` activation opens the same CRITICAL incident but is triaged,
 * because the machine can be wrong about intent in a way a person is not.
 */
export const SOS_INCIDENT_SEVERITY: IncidentSeverity = IncidentSeverity.CRITICAL;
export const SOS_INCIDENT_TYPE: IncidentType = IncidentType.PANIC_ACTIVATION;

/**
 * The one-line summary transmitted to external parties.
 *
 * Deliberately non-clinical and identity-free: enough for a responder to know
 * this is a live emergency and recognise the vehicle, and nothing that turns the
 * dispatch into a dossier. The vehicle registration and position ride in the
 * structured payload alongside it; this is the human-readable line.
 */
export function dispatchSummary(vehicleRegistration: string | null): string {
  const vehicle = vehicleRegistration ? ` on vehicle ${vehicleRegistration}` : '';
  return `Silent emergency activation${vehicle}. Immediate response requested.`;
}
