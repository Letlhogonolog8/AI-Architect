import {
  IdentityModality,
  VehicleStatus,
  type IdentityAssessment,
  type ModalityObservation,
} from '@aegisdrive/types';
import { FUSION_POLICY_VERSION, fuseIdentity } from '@aegisdrive/shared';
import { seededId, type RandomHelpers } from './random';
import { SIMULATION_ORG_ID, type SimulatedVehicle } from './fixtures';

/**
 * Simulated identity assessments.
 *
 * **The simulation generates observations, not scores.** Those observations go
 * through the *real* `fuseIdentity` from `@aegisdrive/shared` — the same
 * function the API calls in production.
 *
 * That is the point. Fabricating a confidence number would exercise nothing and
 * teach nobody anything; running invented sensor readings through the genuine
 * calibration, decay, correlation discount and banding logic means the widget
 * displays real fusion output, and a bug in the maths shows up here rather than
 * in a control room.
 */

function isoSecondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

/**
 * Builds a plausible observation set for one vehicle.
 *
 * Scenarios are weighted to look like a real operating day: most drivers are
 * unremarkable, sensors are frequently degraded, and genuine impostor evidence
 * is rare.
 */
function observationsFor(
  random: RandomHelpers,
  sim: SimulatedVehicle,
): { observations: ModalityObservation[]; expectedOccupants: number; actualOccupants: number } {
  const underThreat = sim.vehicle.status === VehicleStatus.UNDER_THREAT;
  const observations: ModalityObservation[] = [];

  // A vehicle under threat gets impostor-shaped evidence; everything else gets
  // the ordinary spread of good, degraded and missing sensors.
  const scenario = underThreat
    ? random.pick(['impostor', 'impostor', 'spoof'] as const)
    : random.pick([
        'healthy',
        'healthy',
        'healthy',
        'healthy',
        'degraded',
        'degraded',
        'device-only',
      ] as const);

  const enrolmentId = seededId(random, 'enr');

  // ---------------------------------------------------------------- face
  if (scenario !== 'device-only') {
    const spoof = scenario === 'spoof';
    observations.push({
      modality: IdentityModality.FACE,
      score: spoof
        ? random.float(0.88, 0.97) // A spoof matches *well* — that is what makes it dangerous.
        : scenario === 'impostor'
          ? random.float(0.18, 0.42)
          : scenario === 'degraded'
            ? random.float(0.55, 0.72)
            : random.float(0.78, 0.96),
      quality: scenario === 'degraded' ? random.float(0.28, 0.45) : random.float(0.62, 0.94),
      capturedAt: isoSecondsAgo(random.int(3, 90)),
      modelId: 'face-embed-v2',
      enrolmentId,
      spoofDetected: spoof,
      spoofConfidence: spoof ? random.float(0.82, 0.97) : null,
    });
  }

  // --------------------------------------------------------------- voice
  // Frequently absent: a driver who is not speaking produces no sample, which
  // is the normal case rather than an error.
  if (random.chance(0.55) && scenario !== 'device-only') {
    observations.push({
      modality: IdentityModality.VOICE,
      score: scenario === 'impostor' ? random.float(0.22, 0.46) : random.float(0.6, 0.9),
      quality: random.float(0.35, 0.85),
      capturedAt: isoSecondsAgo(random.int(20, 240)),
      modelId: 'speaker-embed-v1',
      enrolmentId,
      spoofDetected: false,
      spoofConfidence: null,
    });
  }

  // -------------------------------------------------------------- device
  // Almost always present, and high even for an impostor: a hijacker who took
  // the vehicle usually took the phone with it. This is exactly why the
  // calibration caps device at a low LLR — presence is not personhood.
  observations.push({
    modality: IdentityModality.DEVICE,
    score: random.chance(0.94) ? random.float(0.88, 0.99) : random.float(0.02, 0.2),
    quality: 1,
    capturedAt: isoSecondsAgo(random.int(5, 400)),
    modelId: 'device-attest-v1',
    enrolmentId: null,
    spoofDetected: false,
    spoofConfidence: null,
  });

  // ----------------------------------------------------------- behaviour
  if (random.chance(0.7)) {
    observations.push({
      modality: IdentityModality.BEHAVIOUR,
      score: scenario === 'impostor' ? random.float(0.25, 0.5) : random.float(0.52, 0.85),
      quality: random.float(0.45, 0.8),
      capturedAt: isoSecondsAgo(random.int(60, 900)),
      modelId: 'behaviour-v1',
      enrolmentId,
      spoofDetected: false,
      spoofConfidence: null,
    });
  }

  // ------------------------------------------------------------ explicit
  // A deliberate unlock earlier in the trip. Decays over 30 minutes.
  if (random.chance(0.4)) {
    observations.push({
      modality: IdentityModality.EXPLICIT,
      score: random.float(0.95, 1),
      quality: 1,
      capturedAt: isoSecondsAgo(random.int(120, 3_000)),
      modelId: 'device-unlock-v1',
      enrolmentId: null,
      spoofDetected: false,
      spoofConfidence: null,
    });
  }

  const expectedOccupants = 1;
  const actualOccupants = underThreat && random.chance(0.6) ? random.int(3, 4) : 1;

  return { observations, expectedOccupants, actualOccupants };
}

export function generateIdentityAssessments(
  random: RandomHelpers,
  vehicles: SimulatedVehicle[],
  limit = 12,
): IdentityAssessment[] {
  // Threatened vehicles first, so the widget's worst-first ordering has
  // something meaningful at the top.
  const ordered = [
    ...vehicles.filter((sim) => sim.vehicle.status === VehicleStatus.UNDER_THREAT),
    ...vehicles.filter((sim) => sim.vehicle.status !== VehicleStatus.UNDER_THREAT),
  ].slice(0, limit);

  return ordered.map((sim) => {
    const { observations, expectedOccupants, actualOccupants } = observationsFor(random, sim);

    const occupancy = {
      occupantCount: actualOccupants,
      recognisedCount: 1,
      unrecognisedCount: Math.max(0, actualOccupants - 1),
      expectedCount: expectedOccupants,
      unexpectedOccupancy: actualOccupants > expectedOccupants + 1,
      confidence: random.float(0.72, 0.96),
      modelId: 'occupancy-v1',
      assessedAt: new Date().toISOString(),
    };

    // The real fusion engine. Not a simulated score.
    const fused = fuseIdentity({ observations, occupancy });

    return {
      id: seededId(random, 'ida'),
      organizationId: SIMULATION_ORG_ID,
      driverId: sim.vehicle.assignedDriverId,
      vehicleId: sim.vehicle.id,
      confidence: fused.confidence,
      band: fused.band,
      fusedLogLikelihoodRatio: fused.fusedLogLikelihoodRatio,
      contributions: fused.contributions,
      missingModalities: fused.missingModalities,
      spoofDetected: fused.spoofDetected,
      occupancy,
      assessedAt: new Date().toISOString(),
      policyVersion: FUSION_POLICY_VERSION,
    } satisfies IdentityAssessment;
  });
}
