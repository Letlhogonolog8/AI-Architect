import type { ISODateString, TenantScoped, UUID } from './common';
import type { IncidentSeverity } from './enums';

/**
 * Continuous Identity Engine.
 *
 * Answers one question, continuously: **is the person driving this vehicle the
 * person who should be?**
 *
 * Not a login. A hijacker takes the vehicle *after* authentication has already
 * succeeded, so identity has to be re-established from ambient evidence for the
 * whole trip, not checked once at the door.
 *
 * ## The rule that constrains this entire file
 *
 * **Raw biometrics are never stored, never transmitted and never leave the
 * capture device.** A password can be changed after a breach; a face cannot.
 * What crosses the wire is an irreversible template — a fixed-length vector
 * from which the original sample cannot be reconstructed — wrapped under a
 * per-tenant key. There is no type in this file that carries an image, an audio
 * clip, or anything from which one could be recovered.
 */

// ============================================================================
// Modalities
// ============================================================================

export const IdentityModality = {
  /** Facial embedding from the cabin camera. */
  FACE: 'FACE',
  /** Speaker embedding from cabin audio. Text-independent. */
  VOICE: 'VOICE',
  /** Hardware and OS attestation of the paired phone. */
  DEVICE: 'DEVICE',
  /** Driving style: acceleration, cornering, braking, route habits. */
  BEHAVIOUR: 'BEHAVIOUR',
  /** Touch dynamics and app interaction rhythm on the driver's phone. */
  INTERACTION: 'INTERACTION',
  /** An explicit action by the driver — PIN, biometric unlock, check-in. */
  EXPLICIT: 'EXPLICIT',
} as const;
export type IdentityModality = (typeof IdentityModality)[keyof typeof IdentityModality];

/** Modalities that are biometric and therefore subject to the retention rules. */
export const BIOMETRIC_MODALITIES: readonly IdentityModality[] = [
  IdentityModality.FACE,
  IdentityModality.VOICE,
  IdentityModality.BEHAVIOUR,
  IdentityModality.INTERACTION,
];

// ============================================================================
// Enrolment
// ============================================================================

export const EnrolmentStatus = {
  /** Consent recorded, no samples captured yet. */
  PENDING: 'PENDING',
  /** Capturing samples; not yet usable for verification. */
  CAPTURING: 'CAPTURING',
  ACTIVE: 'ACTIVE',
  /** Subject withdrew consent. Templates are destroyed, the record is kept. */
  WITHDRAWN: 'WITHDRAWN',
  /** Superseded by a re-enrolment, e.g. after a suspected template compromise. */
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;
export type EnrolmentStatus = (typeof EnrolmentStatus)[keyof typeof EnrolmentStatus];

/**
 * Lawful basis for processing a person's biometrics.
 *
 * Required, not optional, and recorded per enrolment. Under POPIA (South
 * Africa) and GDPR, biometric data is a special category: processing it without
 * a recorded basis is unlawful regardless of how well the system works.
 */
export const ConsentBasis = {
  /** Freely given, revocable. The only basis for a passenger. */
  EXPLICIT_CONSENT: 'EXPLICIT_CONSENT',
  /** Contractual: a term of the driver's employment or service agreement. */
  CONTRACT: 'CONTRACT',
  /** Protecting the vital interests of the data subject. Narrow, and audited. */
  VITAL_INTERESTS: 'VITAL_INTERESTS',
} as const;
export type ConsentBasis = (typeof ConsentBasis)[keyof typeof ConsentBasis];

/**
 * An enrolled identity template.
 *
 * `templateRef` is an opaque pointer into the encrypted template store — the
 * vector itself is never part of an API payload, in either direction.
 */
export interface IdentityEnrolment extends TenantScoped {
  id: UUID;
  /** The driver this identity belongs to. Null for a non-driver occupant. */
  driverId: UUID | null;
  /** Set for enrolled passengers who are not drivers. */
  occupantId: UUID | null;
  modality: IdentityModality;
  status: EnrolmentStatus;

  /** Opaque handle to the encrypted template. Never the template itself. */
  templateRef: string;
  /** Versioned model that produced the template, e.g. `face-embed-v2`. */
  modelId: string;
  /** Template format version. A model upgrade requires re-enrolment, not a cast. */
  templateVersion: number;

  /** How many samples the template was built from. Fewer means less reliable. */
  sampleCount: number;
  /** 0-1 mean quality of the enrolment samples. Gates whether it can be used. */
  enrolmentQuality: number;

  consentBasis: ConsentBasis;
  consentRecordedAt: ISODateString;
  /** Consent may be withdrawn at any time; this is when it was. */
  consentWithdrawnAt: ISODateString | null;

  /** Templates expire and must be refreshed. Faces and voices drift. */
  expiresAt: ISODateString | null;
  lastVerifiedAt: ISODateString | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ============================================================================
// Verification
// ============================================================================

/**
 * One modality's opinion, at one moment.
 *
 * This is the unit the fusion engine consumes. Every field is needed: a raw
 * similarity score without quality and freshness cannot be weighted correctly,
 * and without `modelId` the decision is not auditable.
 */
export interface ModalityObservation {
  modality: IdentityModality;
  /**
   * Raw comparison score, 0-1. Modality-specific and **not** comparable across
   * modalities — 0.8 from a face model and 0.8 from a behaviour model mean
   * different things. Calibration is what makes them commensurable.
   */
  score: number;
  /**
   * Sample quality, 0-1. A face at night through a windscreen scores low; a
   * high-quality sample with a mediocre score is more informative than a
   * poor-quality sample with a high one.
   */
  quality: number;
  /** When the sample was captured. Drives temporal decay. */
  capturedAt: ISODateString;
  /** Versioned model that produced the score. */
  modelId: string;
  /** Enrolment the sample was compared against. Null for an unknown subject. */
  enrolmentId: UUID | null;
  /**
   * Set when the modality detected a spoof attempt — a photo held to the
   * camera, a recording played to the microphone. Overrides the score entirely.
   */
  spoofDetected: boolean;
  /** 0-1 confidence in the spoof determination. */
  spoofConfidence: number | null;
}

export const IdentityBand = {
  /** Strong multi-modal agreement. Normal operation. */
  VERIFIED: 'VERIFIED',
  /** Consistent with the enrolled driver, but on thinner evidence. */
  PROBABLE: 'PROBABLE',
  /** Not enough evidence either way. Usually a sensor problem, not an impostor. */
  UNCERTAIN: 'UNCERTAIN',
  /** Evidence actively contradicts the enrolled driver. */
  SUSPECT: 'SUSPECT',
  /** Strong evidence this is not the enrolled driver, or a spoof was detected. */
  IMPOSTOR: 'IMPOSTOR',
} as const;
export type IdentityBand = (typeof IdentityBand)[keyof typeof IdentityBand];

/** How each modality contributed. Required — an unexplainable score is unusable. */
export interface ModalityContribution {
  modality: IdentityModality;
  /** Calibrated log-likelihood ratio. Positive supports the claim. */
  logLikelihoodRatio: number;
  /** Effective weight after quality and decay. */
  weight: number;
  /** Signed contribution to the fused total. Sums to the total across modalities. */
  contribution: number;
  /** Age of the observation, in seconds, at fusion time. */
  ageSeconds: number;
  score: number;
  quality: number;
}

/**
 * The engine's output.
 *
 * `contributions` is not diagnostic detail — it is the product. An operator
 * deciding whether to treat a driver as an impostor must see which signals
 * drove the number, because the decision that follows can put armed responders
 * next to a citizen.
 */
export interface IdentityAssessment extends TenantScoped {
  id: UUID;
  driverId: UUID | null;
  vehicleId: UUID | null;

  /** 0-100. The driver confidence score. */
  confidence: number;
  band: IdentityBand;
  /** Fused log-likelihood ratio, before mapping to a probability. */
  fusedLogLikelihoodRatio: number;

  contributions: ModalityContribution[];
  /** Modalities that had no usable observation, and why. */
  missingModalities: Array<{ modality: IdentityModality; reason: string }>;

  /** True when any modality reported a spoof. Forces the IMPOSTOR band. */
  spoofDetected: boolean;

  /** Occupants detected in the cabin, if the camera was available. */
  occupancy: OccupancyAssessment | null;

  assessedAt: ISODateString;
  /** Versioned fusion policy. Changing thresholds changes outcomes; both are recorded. */
  policyVersion: string;
}

// ============================================================================
// Occupancy
// ============================================================================

/**
 * Cabin occupancy.
 *
 * **Detection, not identification.** The engine counts occupants and flags
 * unexpected ones; it does not attempt to put a name to a face that is not
 * enrolled. That boundary is deliberate and load-bearing — see
 * `docs/adr/0007-biometric-identity.md`. A passenger has not consented to being
 * identified, and building the capability at all creates a facility that will
 * eventually be misused.
 *
 * The operationally useful signal is "there are three people in a vehicle that
 * should have one", which needs no identification whatsoever.
 */
export interface OccupancyAssessment {
  /** Total occupants detected. */
  occupantCount: number;
  /** Occupants matched to an enrolled identity. */
  recognisedCount: number;
  /**
   * Occupants not matching any enrolment. Counted, never identified.
   * A ride-share passenger is unknown and entirely legitimate.
   */
  unrecognisedCount: number;
  /** Expected occupancy for this trip, when the trip declared one. */
  expectedCount: number | null;
  /** True when occupancy exceeds expectation by more than the tolerance. */
  unexpectedOccupancy: boolean;
  /** 0-1 confidence in the count. Low in poor light or with obstruction. */
  confidence: number;
  modelId: string;
  assessedAt: ISODateString;
}

/** An enrolled non-driver occupant — a regular passenger, a colleague, family. */
export interface EnrolledOccupant extends TenantScoped {
  id: UUID;
  displayName: string;
  relationship: string;
  /** Consent is always EXPLICIT_CONSENT for an occupant. Never contractual. */
  consentBasis: ConsentBasis;
  consentRecordedAt: ISODateString;
  consentWithdrawnAt: ISODateString | null;
  status: EnrolmentStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ============================================================================
// Device fingerprinting
// ============================================================================

/**
 * Device attestation.
 *
 * Not biometric, and the strongest single signal available: the phone is
 * physically present, hard to clone, and its OS will vouch for its integrity.
 *
 * Every field is a *stable* hardware or OS property. Nothing here is derived
 * from browsing, contacts, installed apps or anything else the driver would not
 * expect a fleet employer to see.
 */
export interface DeviceFingerprint extends TenantScoped {
  id: UUID;
  driverId: UUID | null;
  /** Stable installation identifier. Rotates on reinstall, which is detected. */
  installationId: string;
  /** SHA-256 over the stable attribute set below. The comparison key. */
  fingerprintHash: string;

  platform: 'IOS' | 'ANDROID';
  osVersion: string;
  deviceModel: string;
  /** Manufacturer-reported, e.g. `Apple`, `Samsung`. */
  manufacturer: string;

  /**
   * Hardware-backed attestation result. `VERIFIED` means the OS vouched for the
   * device's integrity via Play Integrity or DeviceCheck.
   */
  attestation: 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'UNSUPPORTED';
  /** Root or jailbreak detected. Downgrades every signal from this device. */
  compromised: boolean;
  /** Running in an emulator. Effectively always an attack in this product. */
  emulated: boolean;

  firstSeenAt: ISODateString;
  lastSeenAt: ISODateString;
  /** Trusted after a probation period without anomalies. */
  trusted: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ============================================================================
// Behaviour
// ============================================================================

/**
 * A driver's behavioural baseline.
 *
 * Built over a rolling window of normal driving. Every feature is a summary
 * statistic — the baseline holds no route history, no destinations and no
 * timestamps of individual trips, because a system that did would be a
 * movement-tracking database wearing an identity badge.
 */
export interface BehaviourBaseline extends TenantScoped {
  id: UUID;
  driverId: UUID;
  modelId: string;

  /** Trips the baseline is built from. Below `minimumTrips` it is not usable. */
  tripCount: number;
  /** Total driving time contributing to the baseline. */
  observedMinutes: number;

  /** Mean and standard deviation per feature. Names are stable model outputs. */
  features: Record<string, { mean: number; standardDeviation: number }>;

  /** 0-1. How distinctive this driver is. A generic profile discriminates poorly. */
  distinctiveness: number;

  status: EnrolmentStatus;
  lastUpdatedAt: ISODateString;
  createdAt: ISODateString;
}

// ============================================================================
// Policy
// ============================================================================

/**
 * What the platform is permitted to do at each band.
 *
 * The critical constraint: **identity alone never triggers a physical action.**
 * Face recognition has documented, demographically uneven error rates. A false
 * reject that immobilises a vehicle on a highway could kill someone, and it
 * would fall disproportionately on the drivers the models serve worst.
 *
 * So the strongest automated response to an identity signal is *raising it to a
 * human*. Immobilisation requires corroborating evidence and an operator.
 */
export interface IdentityPolicy {
  band: IdentityBand;
  /** Raise an alert to the control room. */
  raiseAlert: boolean;
  alertSeverity: IncidentSeverity | null;
  /** Ask the driver to confirm identity explicitly. */
  challengeDriver: boolean;
  /** Increase telemetry and evidence capture rate. */
  escalateCapture: boolean;
  /** Open an incident automatically. */
  openIncident: boolean;
  /**
   * Always false on every band. Present so the absence is explicit rather than
   * an oversight, and so a reviewer sees the decision was made deliberately.
   */
  permitAutonomousImmobilisation: false;
  description: string;
}

/** A challenge issued to the driver to re-establish identity explicitly. */
export interface IdentityChallenge extends TenantScoped {
  id: UUID;
  driverId: UUID;
  assessmentId: UUID;
  /** `PIN`, `DEVICE_BIOMETRIC`, `VOICE_PHRASE`, `CONTROL_ROOM_CALL`. */
  method: string;
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'EXPIRED' | 'DECLINED';
  issuedAt: ISODateString;
  respondedAt: ISODateString | null;
  expiresAt: ISODateString;
  /**
   * A challenge is a *signal*, not a gate. A driver being hijacked may be
   * unable to answer, and failing to respond must never be treated as proof of
   * anything on its own.
   */
  failureIsNotProof: true;
}
