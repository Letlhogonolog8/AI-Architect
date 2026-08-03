import {
  AIDecisionKind,
  AIDecisionStatus,
  AlertStatus,
  AlertType,
  AutonomyLevel,
  CameraKind,
  CameraStatus,
  CorridorStatus,
  EvidenceStatus,
  EvidenceType,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  ProtectionMode,
  ResponderKind,
  ResponderStatus,
  ThreatLevel,
  VehicleStatus,
  VehicleType,
  type AIDecision,
  type Alert,
  type CameraFeed,
  type CrimeHotspot,
  type Evidence,
  type GeoPoint,
  type Incident,
  type ResponderAsset,
  type SafeCorridor,
  type Vehicle,
} from '@aegisdrive/types';
import {
  HOSPITALS,
  HOTSPOT_AREAS,
  LANDMARKS,
  POLICE_STATIONS,
  SECURITY_DEPOTS,
  distanceMetres,
  interpolate,
  polylineLengthMetres,
  type NamedPlace,
} from './geography';
import { createRandomHelpers, seededId, type RandomHelpers } from './random';

/**
 * Synthetic world generation.
 *
 * Everything here is fabricated. It exists so the command centre can be built,
 * reviewed and demonstrated before the AI services and device fleet exist, and
 * it is confined to `src/mocks/` behind the data-source interface — see
 * `mocks/README.md`.
 *
 * Generation is seeded and therefore reproducible: the same seed always yields
 * the same fleet, which makes a screenshot and the bug report describing it
 * refer to the same vehicle.
 */

export const SIMULATION_SEED = 20260730;
export const SIMULATION_ORG_ID = 'mock-org-0000-4000-a000-000000000001';

const MAKES: readonly [string, readonly string[]][] = [
  ['Toyota', ['Hilux', 'Fortuner', 'Corolla Cross', 'Land Cruiser']],
  ['Ford', ['Ranger', 'Everest', 'Transit']],
  ['Volkswagen', ['Polo Vivo', 'Amarok', 'Crafter']],
  ['Isuzu', ['D-Max', 'FTR 850']],
  ['Mercedes-Benz', ['Sprinter', 'Actros', 'V-Class']],
  ['Nissan', ['Navara', 'NP200']],
];

const DRIVER_FIRST = [
  'Thabo',
  'Lerato',
  'Sipho',
  'Naledi',
  'Johan',
  'Zanele',
  'Pieter',
  'Ayanda',
  'Mandla',
  'Refilwe',
  'Riaan',
  'Nomsa',
  'Kagiso',
  'Anele',
  'Willem',
  'Palesa',
] as const;

const DRIVER_LAST = [
  'Mokoena',
  'van der Merwe',
  'Dlamini',
  'Nkosi',
  'Botha',
  'Khumalo',
  'Pretorius',
  'Ndlovu',
  'Mahlangu',
  'du Plessis',
  'Sithole',
  'Mabaso',
] as const;

function registration(random: RandomHelpers): string {
  const letters = (n: number): string =>
    Array.from({ length: n }, () => 'ABCDEFGHJKLMNPRSTVWXYZ'[random.int(0, 21)]).join('');
  return `${letters(2)} ${random.int(10, 99)} ${letters(2)} GP`;
}

function vin(random: RandomHelpers): string {
  const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  return Array.from({ length: 17 }, () => alphabet[random.int(0, alphabet.length - 1)]).join('');
}

function isoAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

// ============================================================================
// Vehicles
// ============================================================================

export interface SimulatedVehicle {
  vehicle: Vehicle;
  driverName: string;
  /** Index into the corridor list; the route this vehicle is currently driving. */
  corridorIndex: number;
  /** Progress along that corridor, 0-1. */
  progress: number;
  /** Fraction of the corridor covered per tick. */
  speedFactor: number;
  /** True once the simulation has pushed this vehicle off its corridor. */
  deviating: boolean;
}

export function generateVehicles(
  random: RandomHelpers,
  count: number,
  corridors: SafeCorridor[],
): SimulatedVehicle[] {
  return Array.from({ length: count }, (_, index) => {
    const [make, models] = random.pick(MAKES);
    const corridorIndex = random.int(0, corridors.length - 1);
    const corridor = corridors[corridorIndex] as SafeCorridor;
    const progress = random.float(0, 1);
    const position = pointAlong(corridor.waypoints, progress);

    // A small minority are deliberately not healthy, so the dashboard has
    // something to show. The proportions are chosen to look like a real
    // operating day rather than a demo: mostly quiet, occasionally not.
    const roll = random.next();
    const status: VehicleStatus =
      roll > 0.96
        ? VehicleStatus.UNDER_THREAT
        : roll > 0.93
          ? VehicleStatus.IDLE
          : roll > 0.9
            ? VehicleStatus.MAINTENANCE
            : VehicleStatus.IN_TRANSIT;

    const riskScore =
      status === VehicleStatus.UNDER_THREAT ? random.int(78, 97) : random.int(4, 48);

    return {
      driverName: `${random.pick(DRIVER_FIRST)} ${random.pick(DRIVER_LAST)}`,
      corridorIndex,
      progress,
      // Roughly 40-90 km/h expressed as corridor fraction per second.
      speedFactor: random.float(0.0006, 0.0016),
      deviating: false,
      vehicle: {
        id: seededId(random, 'veh'),
        organizationId: SIMULATION_ORG_ID,
        registrationNumber: registration(random),
        vin: vin(random),
        make,
        model: random.pick(models),
        year: random.int(2018, 2026),
        colour: random.pick(['White', 'Silver', 'Black', 'Grey', 'Blue', 'Red']),
        type: random.pick([
          VehicleType.BAKKIE,
          VehicleType.SUV,
          VehicleType.SEDAN,
          VehicleType.VAN,
          VehicleType.TRUCK,
        ]),
        status,
        protectionMode:
          index % 9 === 0
            ? ProtectionMode.SENTINEL
            : index % 5 === 0
              ? ProtectionMode.ESCORT
              : ProtectionMode.GUARDIAN,
        riskScore,
        threatLevel: riskLevel(riskScore),
        assignedDriverId: seededId(random, 'drv'),
        lastPosition: {
          ...position,
          heading: random.float(0, 360),
          speedKph: random.float(0, 110),
        },
        lastSeenAt: isoAgo(random.float(0, 3)),
        odometerKm: random.int(12_000, 340_000),
        deviceSerial: `AEG-${random.int(100000, 999999)}`,
        createdAt: isoAgo(random.int(60, 500_000)),
        updatedAt: isoAgo(random.float(0, 5)),
      },
    };
  });
}

function riskLevel(score: number): ThreatLevel {
  if (score >= 85) return ThreatLevel.SEVERE;
  if (score >= 65) return ThreatLevel.HIGH;
  if (score >= 40) return ThreatLevel.ELEVATED;
  if (score >= 20) return ThreatLevel.GUARDED;
  return ThreatLevel.MINIMAL;
}

/** Position at fractional distance `t` along a polyline. */
export function pointAlong(waypoints: readonly GeoPoint[], t: number): GeoPoint {
  if (waypoints.length === 0) return { longitude: 0, latitude: 0 };
  if (waypoints.length === 1) return waypoints[0] as GeoPoint;

  const clamped = Math.min(1, Math.max(0, t));
  const total = polylineLengthMetres(waypoints);
  let travelled = clamped * total;

  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1] as GeoPoint;
    const to = waypoints[i] as GeoPoint;
    const segment = distanceMetres(from, to);

    if (travelled <= segment || i === waypoints.length - 1) {
      return interpolate(from, to, segment === 0 ? 0 : travelled / segment);
    }
    travelled -= segment;
  }

  return waypoints[waypoints.length - 1] as GeoPoint;
}

// ============================================================================
// SafeCorridors
// ============================================================================

export function generateCorridors(random: RandomHelpers): SafeCorridor[] {
  const pairs: Array<[NamedPlace, NamedPlace]> = [
    [LANDMARKS[0] as NamedPlace, LANDMARKS[9] as NamedPlace],
    [LANDMARKS[3] as NamedPlace, LANDMARKS[2] as NamedPlace],
    [LANDMARKS[1] as NamedPlace, LANDMARKS[8] as NamedPlace],
    [LANDMARKS[11] as NamedPlace, LANDMARKS[7] as NamedPlace],
    [LANDMARKS[4] as NamedPlace, LANDMARKS[10] as NamedPlace],
    [LANDMARKS[5] as NamedPlace, LANDMARKS[0] as NamedPlace],
  ];

  return pairs.map(([origin, destination]) => {
    // Two intermediate waypoints with a lateral offset, so corridors read as
    // routes rather than as straight lines between labels.
    const waypoints: GeoPoint[] = [
      origin.point,
      jitter(interpolate(origin.point, destination.point, 0.33), random, 0.012),
      jitter(interpolate(origin.point, destination.point, 0.66), random, 0.012),
      destination.point,
    ];

    const lengthKm = polylineLengthMetres(waypoints) / 1000;
    const riskScore = random.int(8, 72);

    return {
      id: seededId(random, 'cor'),
      name: `${origin.name} → ${destination.name}`,
      originLabel: origin.name,
      destinationLabel: destination.name,
      status:
        riskScore > 60
          ? CorridorStatus.DEGRADED
          : riskScore > 38
            ? CorridorStatus.CAUTION
            : CorridorStatus.CLEAR,
      waypoints,
      lengthKm: Number(lengthKm.toFixed(1)),
      averageTransitMinutes: Math.round((lengthKm / random.float(38, 62)) * 60),
      riskScore,
      activeVehicleCount: 0, // Recomputed from the live fleet each tick.
      responderCoverage: random.int(2, 9),
      lastAssessedAt: isoAgo(random.int(2, 45)),
    } satisfies SafeCorridor;
  });
}

function jitter(point: GeoPoint, random: RandomHelpers, magnitude: number): GeoPoint {
  return {
    longitude: point.longitude + random.float(-magnitude, magnitude),
    latitude: point.latitude + random.float(-magnitude, magnitude),
  };
}

// ============================================================================
// Responder assets
// ============================================================================

export function generateResponders(random: RandomHelpers): ResponderAsset[] {
  const assets: ResponderAsset[] = [];

  const facility = (place: NamedPlace, kind: ResponderKind, capacity: number): ResponderAsset => ({
    id: seededId(random, 'res'),
    kind,
    name: place.name,
    callSign: null,
    status: ResponderStatus.AVAILABLE,
    position: place.point,
    heading: null,
    contactNumber: `+2711${random.int(1000000, 9999999)}`,
    capacity,
    distanceMetres: null,
    etaMinutes: null,
    lastUpdatedAt: isoAgo(random.int(1, 20)),
  });

  for (const station of POLICE_STATIONS) {
    assets.push(facility(station, ResponderKind.POLICE, random.int(4, 18)));
  }
  for (const hospital of HOSPITALS) {
    assets.push(facility(hospital, ResponderKind.HOSPITAL, random.int(20, 320)));
  }
  for (const depot of SECURITY_DEPOTS) {
    assets.push(facility(depot, ResponderKind.SECURITY, random.int(6, 24)));
  }

  // Mobile units, which are the ones that actually move on the map.
  for (let i = 0; i < 14; i += 1) {
    const anchor = random.pick([...POLICE_STATIONS, ...SECURITY_DEPOTS]);
    const isPolice = POLICE_STATIONS.includes(anchor);

    assets.push({
      id: seededId(random, 'res'),
      kind: isPolice ? ResponderKind.POLICE : ResponderKind.SECURITY,
      name: isPolice ? `SAPS Patrol ${i + 1}` : `Armed Response ${i + 1}`,
      callSign: `${isPolice ? 'ZA-SAPS' : 'AEG'}-${String(i + 1).padStart(2, '0')}`,
      status: random.pick([
        ResponderStatus.AVAILABLE,
        ResponderStatus.AVAILABLE,
        ResponderStatus.EN_ROUTE,
        ResponderStatus.ON_SCENE,
        ResponderStatus.BUSY,
      ]),
      position: jitter(anchor.point, random, 0.03),
      heading: random.float(0, 360),
      contactNumber: `+2782${random.int(1000000, 9999999)}`,
      capacity: random.int(2, 4),
      distanceMetres: null,
      etaMinutes: null,
      lastUpdatedAt: isoAgo(random.float(0, 3)),
    });
  }

  return assets;
}

// ============================================================================
// Crime hotspots
// ============================================================================

export function generateHotspots(random: RandomHelpers): CrimeHotspot[] {
  return HOTSPOT_AREAS.map((area) => {
    const incidentCount = random.int(4, 61);
    const level =
      incidentCount > 45
        ? ThreatLevel.SEVERE
        : incidentCount > 30
          ? ThreatLevel.HIGH
          : incidentCount > 16
            ? ThreatLevel.ELEVATED
            : ThreatLevel.GUARDED;

    // Most hijackings cluster after dark; the windows reflect that rather than
    // being uniformly random, so the time-of-day filter behaves sensibly.
    const nocturnal = random.chance(0.7);

    return {
      id: seededId(random, 'hot'),
      name: area.name,
      level,
      centre: area.point,
      radiusMetres: random.int(450, 2200),
      incidentCount90d: incidentCount,
      dominantIncidentType: random.pick([
        IncidentType.HIJACKING,
        IncidentType.ATTEMPTED_HIJACKING,
        IncidentType.SMASH_AND_GRAB,
        IncidentType.THEFT,
      ]),
      activeFromHour: nocturnal ? random.int(17, 21) : random.int(5, 9),
      activeToHour: nocturnal ? random.int(1, 5) : random.int(15, 19),
      confidence: random.float(0.66, 0.97),
      source: random.pick(['SAPS', 'INTERNAL', 'PARTNER_FEED']),
      lastUpdatedAt: isoAgo(random.int(30, 2880)),
    } satisfies CrimeHotspot;
  });
}

// ============================================================================
// Cameras
// ============================================================================

const DETECTION_LABELS = [
  'Person',
  'Vehicle',
  'Motorcycle',
  'Licence plate',
  'Face',
  'Bag',
  'Crowd',
] as const;

const CRITICAL_LABELS = ['Weapon', 'Forced entry', 'Occupant distress'] as const;

export function generateCameras(random: RandomHelpers, vehicles: SimulatedVehicle[]): CameraFeed[] {
  const feeds: CameraFeed[] = [];
  const monitored = vehicles.slice(0, 8);

  for (const { vehicle } of monitored) {
    const kinds = [CameraKind.FORWARD, CameraKind.CABIN];

    for (const kind of kinds) {
      const offline = random.chance(0.08);
      const degraded = !offline && random.chance(0.12);
      const critical = vehicle.status === VehicleStatus.UNDER_THREAT && kind === CameraKind.CABIN;

      feeds.push({
        id: seededId(random, 'cam'),
        vehicleId: vehicle.id,
        label: `${vehicle.registrationNumber} · ${kind === CameraKind.CABIN ? 'Cabin' : 'Forward'}`,
        kind,
        status: offline
          ? CameraStatus.OFFLINE
          : degraded
            ? CameraStatus.DEGRADED
            : critical
              ? CameraStatus.RECORDING
              : CameraStatus.LIVE,
        // Deliberately null: there is no real stream. A widget must render an
        // honest offline tile rather than a broken <video> element.
        streamUrl: null,
        resolution: degraded ? '640x360' : '1920x1080',
        framesPerSecond: degraded ? 8 : 25,
        aiAnalysisEnabled: !offline,
        lastFrameAt: offline ? isoAgo(random.int(5, 90)) : isoAgo(random.float(0, 0.1)),
        detections: offline
          ? []
          : Array.from({ length: random.int(0, 3) }, () => {
              const isCritical = critical && random.chance(0.5);
              return {
                id: seededId(random, 'det'),
                label: isCritical ? random.pick(CRITICAL_LABELS) : random.pick(DETECTION_LABELS),
                confidence: random.float(isCritical ? 0.72 : 0.55, 0.99),
                boundingBox: [
                  random.float(0.05, 0.6),
                  random.float(0.05, 0.6),
                  random.float(0.12, 0.32),
                  random.float(0.12, 0.32),
                ] as [number, number, number, number],
                modelId: 'vision-v2',
                detectedAt: isoAgo(random.float(0, 1)),
                isCritical,
              };
            }),
      });
    }
  }

  return feeds;
}

// ============================================================================
// Incidents, alerts, evidence
// ============================================================================

export function generateIncidents(random: RandomHelpers, vehicles: SimulatedVehicle[]): Incident[] {
  const threatened = vehicles.filter((v) => v.vehicle.status === VehicleStatus.UNDER_THREAT);
  const others = vehicles.slice(0, 14);

  const build = (sim: SimulatedVehicle, index: number, critical: boolean): Incident => {
    const severity = critical
      ? IncidentSeverity.CRITICAL
      : random.pick([
          IncidentSeverity.LOW,
          IncidentSeverity.MEDIUM,
          IncidentSeverity.MEDIUM,
          IncidentSeverity.HIGH,
        ]);

    const type = critical
      ? random.pick([IncidentType.HIJACKING, IncidentType.ATTEMPTED_HIJACKING])
      : random.pick([
          IncidentType.GEOFENCE_BREACH,
          IncidentType.SMASH_AND_GRAB,
          IncidentType.PANIC_ACTIVATION,
          IncidentType.UNAUTHORISED_USE,
          IncidentType.COLLISION,
        ]);

    const status = critical
      ? random.pick([IncidentStatus.DETECTED, IncidentStatus.RESPONDING, IncidentStatus.ESCALATED])
      : random.pick([
          IncidentStatus.TRIAGED,
          IncidentStatus.RESPONDING,
          IncidentStatus.CONTAINED,
          IncidentStatus.RESOLVED,
        ]);

    const detectedMinutesAgo = critical ? random.float(0.5, 25) : random.float(20, 2400);
    const aiDetected = random.chance(0.7);

    return {
      id: seededId(random, 'inc'),
      organizationId: SIMULATION_ORG_ID,
      reference: `INC-2026-${String(index + 1).padStart(6, '0')}`,
      type,
      severity,
      status,
      title: `${humanise(type)} — ${sim.vehicle.registrationNumber}`,
      summary: `Detected on ${sim.vehicle.make} ${sim.vehicle.model} assigned to ${sim.driverName}. ${
        critical
          ? 'Vehicle deviated from its SafeCorridor and a following pattern was confirmed. Response dispatched.'
          : 'Automated detection raised for operator review.'
      }`,
      vehicleId: sim.vehicle.id,
      driverId: sim.vehicle.assignedDriverId,
      position: sim.vehicle.lastPosition
        ? {
            longitude: sim.vehicle.lastPosition.longitude,
            latitude: sim.vehicle.lastPosition.latitude,
          }
        : null,
      detectedAt: isoAgo(detectedMinutesAgo),
      acknowledgedAt:
        status === IncidentStatus.DETECTED ? null : isoAgo(detectedMinutesAgo - random.float(0, 3)),
      resolvedAt:
        status === IncidentStatus.RESOLVED ? isoAgo(random.float(0, detectedMinutesAgo)) : null,
      assignedToUserId: null,
      aiConfidence: aiDetected ? random.float(0.61, 0.98) : null,
      evidenceCount: random.int(0, 9),
      createdAt: isoAgo(detectedMinutesAgo),
      updatedAt: isoAgo(random.float(0, 10)),
    };
  };

  return [
    ...threatened.map((sim, i) => build(sim, i, true)),
    ...others.map((sim, i) => build(sim, threatened.length + i, false)),
  ];
}

export function generateAlerts(random: RandomHelpers, incidents: Incident[]): Alert[] {
  return incidents.slice(0, 10).map((incident) => ({
    id: seededId(random, 'alr'),
    organizationId: SIMULATION_ORG_ID,
    type: random.pick([
      AlertType.ANOMALY,
      AlertType.PREDICTIVE_RISK,
      AlertType.GEOFENCE,
      AlertType.PANIC,
      AlertType.DEVICE_TAMPER,
      AlertType.SIGNAL_LOSS,
    ]),
    status: random.chance(0.6) ? AlertStatus.OPEN : AlertStatus.ACKNOWLEDGED,
    severity: incident.severity,
    title: incident.title,
    message: incident.summary,
    vehicleId: incident.vehicleId,
    driverId: incident.driverId,
    incidentId: incident.id,
    raisedAt: incident.detectedAt,
    acknowledgedAt: incident.acknowledgedAt,
    acknowledgedByUserId: null,
    createdAt: incident.detectedAt,
    updatedAt: incident.updatedAt,
  }));
}

export function generateEvidence(random: RandomHelpers, incidents: Incident[]): Evidence[] {
  return incidents.slice(0, 12).flatMap((incident) =>
    Array.from({ length: random.int(1, 2) }, () => {
      const type = random.pick([
        EvidenceType.VIDEO,
        EvidenceType.AUDIO,
        EvidenceType.IMAGE,
        EvidenceType.TELEMETRY_SNAPSHOT,
        EvidenceType.AI_INFERENCE,
      ]);

      const sealed = random.chance(0.75);

      return {
        id: seededId(random, 'evd'),
        organizationId: SIMULATION_ORG_ID,
        incidentId: incident.id,
        vehicleId: incident.vehicleId,
        type,
        status: sealed
          ? random.chance(0.6)
            ? EvidenceStatus.VERIFIED
            : EvidenceStatus.SEALED
          : EvidenceStatus.PENDING_UPLOAD,
        label: `${incident.reference} · ${humanise(type)}`,
        storageKey: `${SIMULATION_ORG_ID}/${incident.detectedAt.slice(0, 10)}/${seededId(random, 'obj')}`,
        mimeType:
          type === EvidenceType.VIDEO
            ? 'video/mp4'
            : type === EvidenceType.AUDIO
              ? 'audio/aac'
              : type === EvidenceType.IMAGE
                ? 'image/jpeg'
                : 'application/json',
        sizeBytes: random.int(48_000, 1_400_000_000),
        durationSeconds: type === EvidenceType.VIDEO ? random.int(12, 900) : null,
        checksum: Array.from({ length: 64 }, () => random.int(0, 15).toString(16)).join(''),
        capturedAt: incident.detectedAt,
        sealedAt: sealed ? incident.detectedAt : null,
        uploadedByUserId: null,
        createdAt: incident.detectedAt,
        updatedAt: incident.updatedAt,
      } satisfies Evidence;
    }),
  );
}

// ============================================================================
// AI decisions
// ============================================================================

export function generateAIDecisions(
  random: RandomHelpers,
  vehicles: SimulatedVehicle[],
  incidents: Incident[],
): AIDecision[] {
  const templates: Array<{
    kind: AIDecisionKind;
    modelId: string;
    title: (reg: string) => string;
    rationale: (reg: string) => string[];
    severity: IncidentSeverity;
    autonomy: AutonomyLevel;
    actions: AIDecision['recommendedActions'];
  }> = [
    {
      kind: AIDecisionKind.THREAT_ASSESSMENT,
      modelId: 'tailing-v3',
      title: (reg) => `Following pattern detected behind ${reg}`,
      rationale: (reg) => [
        `A single vehicle has matched ${reg} through 6 consecutive turns over 4.2 km.`,
        'Inter-vehicle distance held between 18 m and 34 m across two speed changes.',
        'Route entered a hotspot with 47 recorded hijackings in the trailing 90 days.',
        'Driver has not deviated from the assigned SafeCorridor, ruling out an intentional detour.',
      ],
      severity: IncidentSeverity.CRITICAL,
      autonomy: AutonomyLevel.SUPERVISED,
      actions: [
        {
          id: 'dispatch',
          label: 'Dispatch nearest armed response',
          kind: 'DISPATCH',
          permission: 'incident:dispatch',
          destructive: false,
          payload: null,
        },
        {
          id: 'escalate',
          label: 'Escalate to control room lead',
          kind: 'ESCALATE',
          permission: 'incident:escalate',
          destructive: false,
          payload: null,
        },
        {
          id: 'dismiss',
          label: 'Dismiss as false positive',
          kind: 'DISMISS',
          permission: 'incident:update',
          destructive: false,
          payload: null,
        },
      ],
    },
    {
      kind: AIDecisionKind.ROUTE_RECOMMENDATION,
      modelId: 'route-v2',
      title: (reg) => `Reroute ${reg} away from an active hotspot`,
      rationale: () => [
        'The planned route passes within 300 m of a zone whose risk rose two bands in the last hour.',
        'An alternative corridor adds 6 minutes and reduces composite exposure by 41%.',
        'Response coverage on the alternative is 3 units within an 8-minute radius.',
      ],
      severity: IncidentSeverity.MEDIUM,
      autonomy: AutonomyLevel.ADVISORY,
      actions: [
        {
          id: 'reroute',
          label: 'Send reroute to driver',
          kind: 'REROUTE',
          permission: 'vehicle:update',
          destructive: false,
          payload: null,
        },
        {
          id: 'dismiss',
          label: 'Keep current route',
          kind: 'DISMISS',
          permission: 'vehicle:read',
          destructive: false,
          payload: null,
        },
      ],
    },
    {
      kind: AIDecisionKind.COUNTERMEASURE,
      modelId: 'risk-v4',
      title: (reg) => `Immobilisation available for ${reg}`,
      rationale: (reg) => [
        `${reg} has been stationary for 7 minutes outside any known stop, with the ignition on.`,
        'Cabin audio classifier returned duress speech at 0.88 confidence.',
        'The assigned driver has not responded to two check-in prompts.',
        'Vehicle is 1.2 km from the nearest response unit; immobilisation would hold it in place.',
      ],
      severity: IncidentSeverity.CRITICAL,
      // Never AUTONOMOUS: immobilising an occupied vehicle on a highway can
      // kill someone. A human commits this, always.
      autonomy: AutonomyLevel.SUPERVISED,
      actions: [
        {
          id: 'immobilise',
          label: 'Immobilise vehicle',
          kind: 'IMMOBILISE',
          permission: 'vehicle:immobilise',
          destructive: true,
          payload: null,
        },
        {
          id: 'dispatch',
          label: 'Dispatch without immobilising',
          kind: 'DISPATCH',
          permission: 'incident:dispatch',
          destructive: false,
          payload: null,
        },
      ],
    },
    {
      kind: AIDecisionKind.ANOMALY_EXPLANATION,
      modelId: 'behaviour-v2',
      title: (reg) => `Harsh-braking cluster on ${reg}`,
      rationale: () => [
        'Five harsh-braking events in 90 seconds, against a driver baseline of 0.4 per hour.',
        'Speed profile is consistent with congestion rather than evasion.',
        'No corresponding threat signal from the tailing or vision models.',
      ],
      severity: IncidentSeverity.LOW,
      autonomy: AutonomyLevel.ADVISORY,
      actions: [
        {
          id: 'ack',
          label: 'Acknowledge',
          kind: 'ACKNOWLEDGE',
          permission: 'alert:acknowledge',
          destructive: false,
          payload: null,
        },
      ],
    },
    {
      kind: AIDecisionKind.DISPATCH_RECOMMENDATION,
      modelId: 'dispatch-v1',
      title: () => 'Reallocate response coverage — Midrand',
      rationale: () => [
        'Three units are concentrated within 2 km of Sandton while Midrand has none within 12 minutes.',
        'Predicted incident probability in Midrand is 2.4x the current coverage ratio.',
        'Reallocating one unit reduces worst-case response time by an estimated 6 minutes.',
      ],
      severity: IncidentSeverity.INFO,
      autonomy: AutonomyLevel.ADVISORY,
      actions: [
        {
          id: 'notify',
          label: 'Notify dispatch supervisor',
          kind: 'NOTIFY',
          permission: 'notification:send',
          destructive: false,
          payload: null,
        },
      ],
    },
  ];

  return templates.map((template, index) => {
    const sim = vehicles[index % vehicles.length] as SimulatedVehicle;
    const reg = sim.vehicle.registrationNumber;
    const incident = incidents[index % Math.max(1, incidents.length)];

    return {
      id: seededId(random, 'aid'),
      organizationId: SIMULATION_ORG_ID,
      kind: template.kind,
      status:
        index === 0
          ? AIDecisionStatus.PENDING
          : random.pick([
              AIDecisionStatus.PENDING,
              AIDecisionStatus.PENDING,
              AIDecisionStatus.ACCEPTED,
              AIDecisionStatus.REJECTED,
            ]),
      modelId: template.modelId,
      title: template.title(reg),
      rationale: template.rationale(reg),
      confidence: random.float(0.68, 0.97),
      severity: template.severity,
      autonomyLevel: template.autonomy,
      recommendedActions: template.actions,
      vehicleId: sim.vehicle.id,
      incidentId: incident?.id ?? null,
      inferenceMs: random.int(38, 940),
      createdAt: isoAgo(random.float(0.2, 45)),
      decidedAt: null,
      decidedByUserId: null,
    } satisfies AIDecision;
  });
}

function humanise(value: string): string {
  const lowered = value.toLowerCase().replace(/_/g, ' ');
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}
