import {
  AIDecisionStatus,
  CameraStatus,
  IncidentSeverity,
  KpiTrend,
  ResponderStatus,
  ThreatLevel,
  VehicleStatus,
  type AIDecision,
  type Alert,
  type CameraFeed,
  type CrimeHotspot,
  type Evidence,
  type FleetSnapshot,
  type Incident,
  type KpiMetric,
  type ResponderAsset,
  type SafeCorridor,
  type VehiclePositionUpdate,
} from '@aegisdrive/types';
import { SIMULATION_BOUNDS, bearingDegrees, distanceMetres } from './geography';
import {
  SIMULATION_ORG_ID,
  SIMULATION_SEED,
  generateAIDecisions,
  generateAlerts,
  generateCameras,
  generateCorridors,
  generateEvidence,
  generateHotspots,
  generateIncidents,
  generateResponders,
  generateVehicles,
  pointAlong,
  type SimulatedVehicle,
} from './fixtures';
import { createRandomHelpers, seededId, type RandomHelpers } from './random';

/**
 * The simulated world.
 *
 * A single mutable model that advances on a tick and emits the same event
 * payloads the real Socket.IO server does. Because the payload types come from
 * `ServerToClientEvents`, a change to the wire contract breaks this file at
 * compile time — the simulation cannot silently drift from the real protocol,
 * which is the failure mode that makes most mock layers worthless.
 *
 * One instance per browser tab, created lazily.
 */

const VEHICLE_COUNT = 42;
/** Wall-clock interval between physics ticks. */
export const TICK_INTERVAL_MS = 1_000;

export interface SimulationSnapshot {
  vehicles: SimulatedVehicle[];
  corridors: SafeCorridor[];
  responders: ResponderAsset[];
  hotspots: CrimeHotspot[];
  cameras: CameraFeed[];
  incidents: Incident[];
  alerts: Alert[];
  evidence: Evidence[];
  decisions: AIDecision[];
  kpis: KpiMetric[];
}

/** Events the simulation emits on a tick, mirroring `ServerToClientEvents`. */
export interface SimulationEvents {
  onVehiclePosition: (update: VehiclePositionUpdate) => void;
  onResponderUpdated: (responder: ResponderAsset) => void;
  onCameraUpdate: (update: {
    cameraId: string;
    status: CameraStatus;
    detections: CameraFeed['detections'];
    lastFrameAt: string;
  }) => void;
  onKpiTick: (metrics: KpiMetric[]) => void;
  onAIDecision: (decision: AIDecision) => void;
  onAlert: (alert: Alert) => void;
  onFleetSnapshot: (snapshot: FleetSnapshot) => void;
}

export class Simulation {
  private readonly random: RandomHelpers;
  private readonly state: SimulationSnapshot;
  private tickCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private subscribers = new Set<Partial<SimulationEvents>>();

  constructor(seed: number = SIMULATION_SEED) {
    this.random = createRandomHelpers(seed);

    const corridors = generateCorridors(this.random);
    const vehicles = generateVehicles(this.random, VEHICLE_COUNT, corridors);
    const incidents = generateIncidents(this.random, vehicles);

    this.state = {
      corridors,
      vehicles,
      incidents,
      responders: generateResponders(this.random),
      hotspots: generateHotspots(this.random),
      cameras: generateCameras(this.random, vehicles),
      alerts: generateAlerts(this.random, incidents),
      evidence: generateEvidence(this.random, incidents),
      decisions: generateAIDecisions(this.random, vehicles, incidents),
      kpis: [],
    };

    this.state.kpis = this.buildKpis();
    this.recomputeCorridorLoad();
  }

  // --------------------------------------------------------------- lifecycle

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(handlers: Partial<SimulationEvents>): () => void {
    this.subscribers.add(handlers);
    return () => {
      this.subscribers.delete(handlers);
    };
  }

  private emit<K extends keyof SimulationEvents>(
    event: K,
    ...args: Parameters<SimulationEvents[K]>
  ): void {
    for (const subscriber of this.subscribers) {
      const handler = subscriber[event] as
        ((...a: Parameters<SimulationEvents[K]>) => void) | undefined;
      handler?.(...args);
    }
  }

  // ------------------------------------------------------------------ reads

  snapshot(): SimulationSnapshot {
    return this.state;
  }

  get bounds(): [number, number, number, number] {
    return SIMULATION_BOUNDS;
  }

  fleetSnapshot(): FleetSnapshot {
    const vehicles = this.state.vehicles.map((v) => v.vehicle);
    const openIncidents = this.state.incidents.filter(
      (incident) => !['RESOLVED', 'FALSE_POSITIVE', 'ARCHIVED'].includes(incident.status),
    );

    const criticalIncidents = openIncidents.filter(
      (incident) => incident.severity === IncidentSeverity.CRITICAL,
    ).length;

    const averageRiskScore = Math.round(
      vehicles.reduce((sum, vehicle) => sum + vehicle.riskScore, 0) / Math.max(1, vehicles.length),
    );

    return {
      totalVehicles: vehicles.length,
      vehiclesInTransit: vehicles.filter((v) => v.status === VehicleStatus.IN_TRANSIT).length,
      vehiclesUnderThreat: vehicles.filter((v) => v.status === VehicleStatus.UNDER_THREAT).length,
      driversOnDuty: vehicles.filter((v) => v.status !== VehicleStatus.IDLE).length,
      openIncidents: openIncidents.length,
      criticalIncidents,
      openAlerts: this.state.alerts.filter((a) => a.status === 'OPEN').length,
      averageRiskScore,
      postureLevel: criticalIncidents > 0 ? ThreatLevel.SEVERE : bandFor(averageRiskScore),
      generatedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------------ ticks

  /**
   * Advances the world by one interval.
   *
   * Work is staggered across ticks rather than done every tick: positions move
   * every second because that is what makes the map feel live, but KPIs
   * recompute every 5s and cameras every 3s. Recomputing everything at 1 Hz
   * would burn CPU redrawing panels whose numbers a human cannot read that
   * fast anyway.
   */
  private tick(): void {
    this.tickCount += 1;

    this.advanceVehicles();
    this.advanceResponders();

    if (this.tickCount % 3 === 0) this.advanceCameras();
    if (this.tickCount % 5 === 0) {
      this.state.kpis = this.buildKpis();
      this.emit('onKpiTick', this.state.kpis);
      this.emit('onFleetSnapshot', this.fleetSnapshot());
      this.recomputeCorridorLoad();
    }

    // Occasional new AI decision, so the console visibly receives work.
    if (this.tickCount % 23 === 0) this.raiseDecision();
  }

  private advanceVehicles(): void {
    for (const sim of this.state.vehicles) {
      if (sim.vehicle.status === VehicleStatus.IDLE) continue;
      if (sim.vehicle.status === VehicleStatus.MAINTENANCE) continue;

      const corridor = this.state.corridors[sim.corridorIndex];
      if (!corridor) continue;

      const previous = pointAlong(corridor.waypoints, sim.progress);

      sim.progress += sim.speedFactor;

      // Reaching the destination turns the vehicle around rather than
      // teleporting it to the start, which would look like a tracking glitch.
      if (sim.progress >= 1) {
        sim.progress = 1;
        sim.speedFactor = -Math.abs(sim.speedFactor);
      } else if (sim.progress <= 0) {
        sim.progress = 0;
        sim.speedFactor = Math.abs(sim.speedFactor);
      }

      const next = pointAlong(corridor.waypoints, sim.progress);

      // A threatened vehicle drifts off the corridor, which is what makes the
      // deviation legible on the map.
      const offset = sim.vehicle.status === VehicleStatus.UNDER_THREAT ? 0.0009 : 0;
      const position = {
        longitude: next.longitude + (offset === 0 ? 0 : this.random.float(-offset, offset)),
        latitude: next.latitude + (offset === 0 ? 0 : this.random.float(-offset, offset)),
      };

      const speedKph = Math.min(
        130,
        Math.max(0, (distanceMetres(previous, position) / (TICK_INTERVAL_MS / 1000)) * 3.6),
      );

      sim.vehicle.lastPosition = {
        ...position,
        heading: bearingDegrees(previous, position),
        speedKph,
      };
      sim.vehicle.lastSeenAt = new Date().toISOString();

      // Risk drifts, so gauges move rather than sitting frozen.
      const drift = this.random.float(-1.5, 1.5);
      sim.vehicle.riskScore = Math.min(100, Math.max(0, Math.round(sim.vehicle.riskScore + drift)));
      sim.vehicle.threatLevel = bandFor(sim.vehicle.riskScore);

      this.emit('onVehiclePosition', {
        vehicleId: sim.vehicle.id,
        position: sim.vehicle.lastPosition,
        status: sim.vehicle.status,
        riskScore: sim.vehicle.riskScore,
        threatLevel: sim.vehicle.threatLevel,
        recordedAt: sim.vehicle.lastSeenAt,
      });
    }
  }

  private advanceResponders(): void {
    for (const responder of this.state.responders) {
      // Facilities have no call sign and do not move.
      if (!responder.callSign) continue;
      if (responder.status === ResponderStatus.OFFLINE) continue;

      const drift = responder.status === ResponderStatus.EN_ROUTE ? 0.0012 : 0.0003;

      responder.position = {
        longitude: responder.position.longitude + this.random.float(-drift, drift),
        latitude: responder.position.latitude + this.random.float(-drift, drift),
      };
      responder.heading = (responder.heading ?? 0) + this.random.float(-12, 12);
      responder.lastUpdatedAt = new Date().toISOString();

      this.emit('onResponderUpdated', responder);
    }
  }

  private advanceCameras(): void {
    for (const camera of this.state.cameras) {
      if (camera.status === CameraStatus.OFFLINE) continue;

      // Detections churn: drop the oldest, occasionally add a new one.
      if (this.random.chance(0.4) && camera.detections.length > 0) {
        camera.detections = camera.detections.slice(1);
      }

      if (this.random.chance(0.5)) {
        const critical = camera.status === CameraStatus.RECORDING && this.random.chance(0.35);

        camera.detections = [
          ...camera.detections,
          {
            id: seededId(this.random, 'det'),
            label: critical
              ? this.random.pick(['Weapon', 'Forced entry', 'Occupant distress'])
              : this.random.pick(['Person', 'Vehicle', 'Motorcycle', 'Licence plate', 'Crowd']),
            confidence: this.random.float(critical ? 0.74 : 0.52, 0.99),
            // Annotated because an array literal widens to `number[]`, and the
            // contract is a fixed-length `[x, y, width, height]` tuple.
            boundingBox: [
              this.random.float(0.05, 0.6),
              this.random.float(0.05, 0.6),
              this.random.float(0.12, 0.3),
              this.random.float(0.12, 0.3),
            ] as [number, number, number, number],
            modelId: 'vision-v2',
            detectedAt: new Date().toISOString(),
            isCritical: critical,
          },
        ].slice(-4);
      }

      camera.lastFrameAt = new Date().toISOString();

      this.emit('onCameraUpdate', {
        cameraId: camera.id,
        status: camera.status,
        detections: camera.detections,
        lastFrameAt: camera.lastFrameAt,
      });
    }
  }

  private raiseDecision(): void {
    const pool = this.state.decisions;
    if (pool.length === 0) return;

    const template = this.random.pick(pool);
    const sim = this.random.pick(this.state.vehicles);

    const decision: AIDecision = {
      ...template,
      id: seededId(this.random, 'aid'),
      status: AIDecisionStatus.PENDING,
      vehicleId: sim.vehicle.id,
      confidence: this.random.float(0.66, 0.98),
      inferenceMs: this.random.int(40, 880),
      createdAt: new Date().toISOString(),
      decidedAt: null,
      decidedByUserId: null,
    };

    this.state.decisions = [decision, ...pool].slice(0, 40);
    this.emit('onAIDecision', decision);
  }

  /** Recounts how many live vehicles are on each corridor. */
  private recomputeCorridorLoad(): void {
    const counts = new Map<number, number>();

    for (const sim of this.state.vehicles) {
      if (sim.vehicle.status === VehicleStatus.IDLE) continue;
      counts.set(sim.corridorIndex, (counts.get(sim.corridorIndex) ?? 0) + 1);
    }

    this.state.corridors.forEach((corridor, index) => {
      corridor.activeVehicleCount = counts.get(index) ?? 0;
    });
  }

  // ------------------------------------------------------------------- KPIs

  private kpiHistory = new Map<string, number[]>();

  private pushHistory(id: string, value: number): number[] {
    const series = [...(this.kpiHistory.get(id) ?? []), value].slice(-24);
    this.kpiHistory.set(id, series);
    return series;
  }

  private buildKpis(): KpiMetric[] {
    const snapshot = this.fleetSnapshot();

    const definitions: Array<Omit<KpiMetric, 'series' | 'delta' | 'trend'>> = [
      {
        id: 'vehicles-protected',
        label: 'Vehicles protected',
        value: snapshot.totalVehicles,
        unit: null,
        isPositive: true,
        target: null,
        comparisonLabel: 'vs. last hour',
      },
      {
        id: 'active-threats',
        label: 'Active threats',
        value: snapshot.vehiclesUnderThreat,
        unit: null,
        // Fewer is better, so a rise must render red even though it is "up".
        isPositive: false,
        target: 0,
        comparisonLabel: 'vs. last hour',
      },
      {
        id: 'response-time',
        label: 'Mean response time',
        value: Number(this.random.float(3.4, 7.8).toFixed(1)),
        unit: 'min',
        isPositive: false,
        target: 5,
        comparisonLabel: 'vs. 7-day mean',
      },
      {
        id: 'corridor-adherence',
        label: 'Corridor adherence',
        value: Number(this.random.float(88, 99.4).toFixed(1)),
        unit: '%',
        isPositive: true,
        target: 95,
        comparisonLabel: 'vs. yesterday',
      },
      {
        id: 'ai-precision',
        label: 'AI detection precision',
        value: Number(this.random.float(91, 98.6).toFixed(1)),
        unit: '%',
        isPositive: true,
        target: 95,
        comparisonLabel: 'trailing 1 000 events',
      },
      {
        id: 'telemetry-health',
        label: 'Telemetry uplink',
        value: Number(this.random.float(96.2, 99.98).toFixed(2)),
        unit: '%',
        isPositive: true,
        target: 99,
        comparisonLabel: 'last 15 min',
      },
    ];

    return definitions.map((definition) => {
      const series = this.pushHistory(definition.id, definition.value);
      const previous = series.length > 1 ? (series[series.length - 2] as number) : definition.value;
      const delta = Number((definition.value - previous).toFixed(2));

      return {
        ...definition,
        series,
        delta,
        trend: delta > 0.001 ? KpiTrend.UP : delta < -0.001 ? KpiTrend.DOWN : KpiTrend.FLAT,
      };
    });
  }

  // --------------------------------------------------------------- commands

  resolveDecision(decisionId: string, outcome: 'ACCEPTED' | 'REJECTED'): AIDecision | null {
    const decision = this.state.decisions.find((d) => d.id === decisionId);
    if (!decision) return null;

    decision.status =
      outcome === 'ACCEPTED' ? AIDecisionStatus.ACCEPTED : AIDecisionStatus.REJECTED;
    decision.decidedAt = new Date().toISOString();

    return decision;
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.state.alerts.find((a) => a.id === alertId);
    if (!alert) return;

    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedAt = new Date().toISOString();
  }

  /** Distances and ETAs from each responder to a point, for the dispatch panel. */
  respondersNear(point: { longitude: number; latitude: number }): ResponderAsset[] {
    return this.state.responders
      .map((responder) => {
        const metres = distanceMetres(responder.position, point);
        return {
          ...responder,
          distanceMetres: Math.round(metres),
          // 38 km/h average through urban traffic, plus a one-minute turnout.
          etaMinutes: Math.max(1, Math.round((metres / 1000 / 38) * 60 + 1)),
        };
      })
      .sort((a, b) => (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0));
  }
}

function bandFor(score: number): ThreatLevel {
  if (score >= 85) return ThreatLevel.SEVERE;
  if (score >= 65) return ThreatLevel.HIGH;
  if (score >= 40) return ThreatLevel.ELEVATED;
  if (score >= 20) return ThreatLevel.GUARDED;
  return ThreatLevel.MINIMAL;
}

let instance: Simulation | null = null;

/** Lazily creates the single simulation for this tab. */
export function getSimulation(): Simulation {
  instance ??= new Simulation();
  return instance;
}

export { SIMULATION_ORG_ID };
