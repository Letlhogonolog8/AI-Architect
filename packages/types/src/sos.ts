import type { GeoPoint, ISODateString, TenantScoped, UUID } from './common';

/**
 * Silent Emergency Engine.
 *
 * The response half of the product at its sharpest point: a person in a vehicle
 * decides they are in danger and needs help summoned **without the people
 * around them knowing they did it**.
 *
 * ## The one rule that governs everything in this file
 *
 * **A silent activation is silent.** Nothing the driver, the vehicle, or the
 * app displays may change as a result of raising it, and nothing the platform
 * sends may travel down a channel a device in the vehicle could observe. An
 * attacker who sees the system react learns the driver triggered something, and
 * the driver pays for that with their life.
 *
 * This is the same control that makes `emitBehaviourAssessed` broadcast to the
 * organization room only, and that makes a driver hold `behaviour:submit`
 * without `behaviour:read`. Here it has three concrete consequences that are
 * easy to get wrong:
 *
 * 1. **Activation returns nothing that confirms anything.** The activate
 *    endpoint answers the same neutral acknowledgement whether it opened an
 *    emergency or discarded a duplicate. A `201 Created` with the new record, or
 *    a `409` for a duplicate, would both be tells — a hijacker watching the
 *    phone would see the difference. See `SosActivationReceipt`.
 * 2. **The driver cannot read SOS state.** There is a `sos:activate` permission
 *    and there is deliberately no driver-held `sos:read`. A driver who can open
 *    the app and see "police dispatched" is a driver whose captor can see it
 *    too. The record is for the control room, not the cabin.
 * 3. **There is no vehicle-side stand-down.** A cancel button in the cabin is
 *    the first thing an attacker forces the driver to press. Standing an SOS
 *    down is an authenticated control-room act, never a vehicle one — which is
 *    why `SosStatus.CANCELLED` is reachable only through an operator.
 *
 * ## What the engine does
 *
 * On activation it opens a CRITICAL incident so the control room sees it
 * immediately, then fans the emergency out to the external parties who can act
 * on it — police, private armed response, the driver's family, and the insurer
 * — as `EmergencyDispatch` records.
 *
 * ## Why the external "APIs" do not fabricate

 * There is no live police, security or insurance integration installed in this
 * build, and the engine says so rather than pretending. A dispatch to a channel
 * with no registered provider is recorded as `UNCONFIGURED`, not `SENT`. This is
 * the same honesty as the AI gateway returning 501 for an absent model and the
 * router returning 501 for an absent road graph: a delivery nobody made must
 * never be recorded as a delivery, because in this product an operator who
 * believes the police were called when they were not will stop trying to call
 * them.
 *
 * See `docs/adr/0012-silent-emergency-engine.md`.
 */

// ============================================================================
// Activation
// ============================================================================

/**
 * How a silent SOS was raised.
 *
 * Every method here is covert by construction — none produces a sound, a light,
 * or a screen change an onlooker would notice. That is the whole point of the
 * enum: a "call for help" button that announces itself is a different, and in a
 * hijacking a useless, feature.
 */
export const SosActivationMethod = {
  /** A concealed physical button wired into the cabin. */
  HIDDEN_BUTTON: 'HIDDEN_BUTTON',
  /**
   * A PIN that unlocks the app or vehicle normally, so it looks like
   * compliance, while silently signalling duress. The captor sees the driver
   * cooperate; the control room sees the alarm.
   */
  DURESS_PIN: 'DURESS_PIN',
  /** A spoken safe-word or phrase, recognised by the cabin audio pipeline. */
  DURESS_PHRASE: 'DURESS_PHRASE',
  /** A pattern on the phone's physical buttons — no screen interaction. */
  POWER_BUTTON_SEQUENCE: 'POWER_BUTTON_SEQUENCE',
  /** A covert gesture in the app, e.g. a long-press that shows no feedback. */
  APP_GESTURE: 'APP_GESTURE',
  /** A paired panic wearable held or pressed. */
  WEARABLE: 'WEARABLE',
  /**
   * Failure to answer a liveness check the driver expected. A dead-man switch
   * fires when nobody stands it down, which is exactly the case a coerced or
   * incapacitated driver cannot cover for themselves.
   */
  DEADMAN: 'DEADMAN',
  /**
   * Raised automatically by the Threat Decision Engine, not by a person. Carries
   * a confidence, and is the one method that can be wrong about whether a human
   * meant to trigger it — which is why the incident it opens is still triaged.
   */
  DECISION_ENGINE: 'DECISION_ENGINE',
} as const;
export type SosActivationMethod = (typeof SosActivationMethod)[keyof typeof SosActivationMethod];

/**
 * The lifecycle of a silent SOS.
 *
 * Forward-only, like an incident's. The activation *fact* is immutable — an SOS
 * that was raised was raised — and the status only advances through handling.
 * `FALSE_ALARM` is a terminal disposition an operator records after reviewing;
 * it does not erase the activation, because a record of every trigger, including
 * the mistaken ones, is how the false-alarm rate is ever measured.
 */
export const SosStatus = {
  /** Raised, incident opened, not yet taken by a responder. */
  ACTIVATED: 'ACTIVATED',
  /** Fan-out to the external channels is under way. */
  DISPATCHING: 'DISPATCHING',
  /** An operator or responder has taken ownership. */
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  /** Handled and stood down as a genuine emergency. */
  RESOLVED: 'RESOLVED',
  /**
   * Stood down by an authenticated operator because the driver is confirmed
   * safe. Never reachable from the vehicle — see the file header.
   */
  CANCELLED: 'CANCELLED',
  /** Reviewed and judged not to have been a genuine emergency. */
  FALSE_ALARM: 'FALSE_ALARM',
} as const;
export type SosStatus = (typeof SosStatus)[keyof typeof SosStatus];

/** SOS statuses that still need someone in the control room to act. */
export const OPEN_SOS_STATUSES: readonly SosStatus[] = [
  SosStatus.ACTIVATED,
  SosStatus.DISPATCHING,
  SosStatus.ACKNOWLEDGED,
];

/**
 * A silent emergency activation.
 *
 * Tenant-scoped and, wherever it can be, linked to the vehicle and driver it
 * came from. The position is a single point captured at activation; the live
 * feed to responders is the incident's, shared under the same time-bounded grant
 * the corridor engine already governs, not a standing channel opened here.
 */
export interface SosActivation extends TenantScoped {
  id: UUID;
  vehicleId: UUID | null;
  driverId: UUID | null;

  method: SosActivationMethod;
  status: SosStatus;

  /**
   * Always `true` in this build. Present as a field, rather than assumed, so
   * that any future non-covert path is a visible, arguable schema change and not
   * a quiet default someone flips. A non-covert emergency is a different product
   * with different risks.
   */
  covert: boolean;

  /** Where the vehicle was at activation, when the device reported it. */
  position: GeoPoint | null;

  /**
   * 0-1 confidence, only for `DECISION_ENGINE` activations. Null when a person
   * triggered it — a human pressing a panic button is not a probability.
   */
  confidence: number | null;
  /** Provenance of the trigger, e.g. `mobile-app` or `decision-engine-v2`. */
  source: string;

  /** The CRITICAL incident opened for this activation. */
  incidentId: UUID | null;

  activatedAt: ISODateString;
  acknowledgedAt: ISODateString | null;
  acknowledgedByUserId: UUID | null;
  resolvedAt: ISODateString | null;
  resolvedByUserId: UUID | null;
  /** The operator's disposition note when it was stood down. */
  dispositionNote: string | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * A summary that travels with an activation for the control room.
 *
 * The activation plus its dispatch fan-out, which is what an operator actually
 * needs to see: not just that an SOS was raised, but who has and has not yet
 * been reached.
 */
export interface SosActivationDetail extends SosActivation {
  dispatches: EmergencyDispatch[];
}

// ============================================================================
// Dispatch
// ============================================================================

/**
 * An external party an emergency is fanned out to.
 *
 * These four are the deliberate whole of it. There is no "everyone" channel and
 * no free-text channel: each is a distinct recipient with a distinct provider
 * contract, distinct data minimisation, and a distinct reason to be told.
 */
export const EmergencyChannel = {
  /** Law enforcement — a case number and an intercept. */
  POLICE: 'POLICE',
  /** The operator's contracted armed-response company. */
  PRIVATE_SECURITY: 'PRIVATE_SECURITY',
  /** The driver's nominated emergency contact. */
  FAMILY: 'FAMILY',
  /** The vehicle's insurer, for recovery and claim initiation. */
  INSURANCE: 'INSURANCE',
} as const;
export type EmergencyChannel = (typeof EmergencyChannel)[keyof typeof EmergencyChannel];

/**
 * The outcome of a single dispatch.
 *
 * `UNCONFIGURED` is the load-bearing member. It records the honest state of a
 * dispatch to a channel that has no provider installed: the platform intended to
 * reach this party, and could not, and is saying so. It is not `FAILED` — a
 * failure is a provider that was asked and could not deliver — and it is
 * emphatically not `SENT`, which would be a lie the control room would act on.
 */
export const DispatchStatus = {
  /** Created, awaiting hand-off to a channel provider. */
  PENDING: 'PENDING',
  /** Handed to the provider. */
  SENT: 'SENT',
  /** The provider confirmed the recipient received it. */
  DELIVERED: 'DELIVERED',
  /** The recipient acknowledged — e.g. police returned a case reference. */
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  /** The provider was asked and could not deliver. Carries a reason. */
  FAILED: 'FAILED',
  /** No provider is installed for this channel. Recorded, never faked. */
  UNCONFIGURED: 'UNCONFIGURED',
  /** Stood down before it was delivered. */
  CANCELLED: 'CANCELLED',
} as const;
export type DispatchStatus = (typeof DispatchStatus)[keyof typeof DispatchStatus];

/** Dispatch outcomes that mean the party was, as far as we know, actually reached. */
export const REACHED_DISPATCH_STATUSES: readonly DispatchStatus[] = [
  DispatchStatus.DELIVERED,
  DispatchStatus.ACKNOWLEDGED,
];

/**
 * One attempt to reach one external party about one activation.
 *
 * `payload` is the exact content transmitted, retained because a dispatch to law
 * enforcement or an insurer may be examined later and "we told them" is not an
 * answer. It carries the minimum the recipient needs to act — a position, a
 * vehicle reference, an incident reference — and deliberately not the driver's
 * identity, biometric state, or behaviour assessment. A police intercept needs
 * to know where the car is, not who the engine thinks is driving it.
 */
export interface EmergencyDispatch extends TenantScoped {
  id: UUID;
  activationId: UUID;

  channel: EmergencyChannel;
  status: DispatchStatus;

  /** The receiving unit, company, contact or insurer, as the operator names it. */
  recipientReference: string;
  /** The endpoint used — a phone number, a webhook — when one is known. */
  recipientContact: string | null;

  /** The provider that handled it, e.g. `police-webhook-v1`. Null when none. */
  providerId: string | null;
  /** The reference the recipient returned, e.g. a case number. */
  externalReference: string | null;

  /** Exactly what was transmitted. Minimised; see the type doc. */
  payload: EmergencyDispatchPayload;

  attemptCount: number;
  lastAttemptAt: ISODateString | null;
  sentAt: ISODateString | null;
  acknowledgedAt: ISODateString | null;
  /** Populated when `status` is FAILED. */
  failureReason: string | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * The minimised content of a dispatch.
 *
 * This is the data-protection boundary of the whole engine. An external party
 * gets what it needs to respond to an emergency and nothing that would make this
 * a surveillance feed: no identity band, no occupancy, no behaviour signals, no
 * template references. The insurer gets even less than the police.
 */
export interface EmergencyDispatchPayload {
  /** Human-quotable incident reference, e.g. `INC-2026-000481`. */
  incidentReference: string | null;
  /** The vehicle's registration, so a responder can recognise it. */
  vehicleRegistration: string | null;
  /** Last known position. The single most useful field for an intercept. */
  position: GeoPoint | null;
  /** When the SOS was raised. */
  activatedAt: ISODateString;
  /** A one-line, non-clinical summary of the emergency. */
  summary: string;
}

// ============================================================================
// Activation receipt
// ============================================================================

/**
 * What the activate endpoint returns — and, more importantly, what it does not.
 *
 * A single neutral acknowledgement, identical for a genuine new activation, a
 * de-duplicated repeat, and (as far as an observer can tell) a rejected one. It
 * carries no identifier, no status, and no count. The endpoint answers `202`
 * with this body in every accepted case, so that a captor watching the driver's
 * screen learns nothing from the response.
 *
 * The real record exists server-side and is visible to the control room. The
 * cabin gets a receipt that says only "received", because anything more is a
 * signal, and the entire engine is built so the cabin emits no signal.
 */
export interface SosActivationReceipt {
  received: true;
}
