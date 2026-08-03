import type { GeoPoint, ISODateString, TenantScoped, UUID } from './common';
import type { IncidentType } from './enums';

/**
 * SafeCorridor AI.
 *
 * The preventive half of the product: rather than reacting to a hijacking,
 * route the vehicle along a path whose risk is understood and whose response
 * coverage is known.
 *
 * ## The problem this file is mostly about
 *
 * **Crime-avoidance routing is redlining unless it is built very carefully.**
 *
 * In South Africa, "high-crime area" maps almost exactly onto apartheid spatial
 * planning. A router that avoids areas with elevated crime statistics avoids
 * townships, and a fleet running that router stops serving the people who live
 * in them. That is not a hypothetical: "high-risk zone" exclusions have already
 * produced documented delivery deserts elsewhere, and the residents of an
 * excluded area experience it as a service they cannot buy.
 *
 * It is also discriminatory in effect under the Promotion of Equality and
 * Prevention of Unfair Discrimination Act, whatever the intent behind it.
 *
 * Drivers are genuinely killed in hijackings, so the answer is not to refuse to
 * build this. The answer is four structural constraints, each enforced by a
 * type in this file rather than by a policy document:
 *
 * 1. **Risk attaches to road segments in time windows, never to areas.** "This
 *    offramp between 18:00 and 21:00" is operationally precise and redlines
 *    nobody. There is no area-level risk type here, and adding one would be the
 *    change to argue about.
 * 2. **A destination is never avoided.** Avoidance applies to *through-traffic*
 *    only. `RoutingPolicy.neverExcludeDestination` is typed as the literal
 *    `true`. A driver going to Alexandra is routed to Alexandra.
 * 3. **The detour cost is measured and reported.** If the router systematically
 *    adds time to trips serving particular destinations, `RoutingEquityRecord`
 *    makes that visible instead of leaving it to be discovered by the people
 *    being underserved.
 * 4. **The risk map is never trained on the platform's own alerts.** See
 *    `HazardSource`. That feedback loop is how predictive policing systems
 *    manufacture the pattern they claim to find.
 *
 * See `docs/adr/0011-safecorridor-routing.md`.
 */

// ============================================================================
// Hazard
// ============================================================================

/**
 * Where a hazard estimate came from.
 *
 * Provenance is load-bearing rather than metadata, for two reasons that pull in
 * opposite directions and both matter.
 *
 * Reported-crime statistics measure **reporting and policing intensity**, not
 * crime. Under-reporting varies enormously between areas, so a low reported
 * rate can mean a safe road or a road whose residents do not call the police.
 * Neither reading is safe to act on silently.
 *
 * And `PLATFORM_ALERT` is deliberately **not** a member of this union. The
 * platform's own alerts must never feed its risk map: flagging a segment raises
 * monitoring there, which raises detections, which raises the flag. That loop
 * manufactures the pattern it claims to have found, and it is the central
 * failure of every predictive-policing deployment that has been audited.
 * Only *confirmed* incidents count, and confirmation requires a human.
 */
export const HazardSource = {
  /** Incidents confirmed by an operator on this platform. Highest trust. */
  CONFIRMED_INCIDENT: 'CONFIRMED_INCIDENT',
  /** Official police crime statistics. Subject to reporting bias. */
  POLICE_STATISTICS: 'POLICE_STATISTICS',
  /** An insurer or industry body's aggregated claims data. */
  PARTNER_FEED: 'PARTNER_FEED',
  /** A road authority's closure, roadworks or hazard notice. */
  ROAD_AUTHORITY: 'ROAD_AUTHORITY',
  /** Entered by an analyst with a written justification. */
  MANUAL_ASSESSMENT: 'MANUAL_ASSESSMENT',
} as const;
export type HazardSource = (typeof HazardSource)[keyof typeof HazardSource];

/**
 * A stretch of road.
 *
 * Identified by a stable external reference — an OSM way, a road-authority
 * segment id — plus the polyline. Segment-level rather than area-level is the
 * whole design, so there is deliberately no `suburb`, `district` or `areaType`
 * field, and nothing here from which one could be derived and grouped on.
 */
export interface RoadSegment {
  id: UUID;
  /** Stable external identifier, e.g. `osm:way/12345`. */
  externalRef: string;
  /** Human label for an operator, e.g. "M1 South, Corlett offramp". */
  label: string;
  /** Ordered polyline. Two points minimum. */
  geometry: GeoPoint[];
  lengthMetres: number;
  /** Free-flow travel time. The denominator for congestion. */
  freeFlowSeconds: number;
}

/**
 * How dangerous a segment is, expressed as a rate.
 *
 * ## Why a rate and not a score
 *
 * A "risk score" of 73 cannot be added, compared across segments of different
 * lengths, or traded off against travel time — it has no units, so any
 * arithmetic done with it is arbitrary.
 *
 * An incident *rate* per vehicle-hour can do all three. Multiply by the time a
 * vehicle will spend on the segment and you get **expected incidents**, which
 * is a real quantity that sums along a route and trades off directly against
 * minutes. It also connects to the base rates the behaviour and decision
 * engines already use, so the whole platform is reasoning in one currency.
 *
 * The self-correcting property matters most: a long detour accumulates its own
 * exposure, because more hours on the road is more risk. A router minimising
 * expected incidents will not send a driver two hours around a bad offramp,
 * because the arithmetic already knows that is worse.
 */
export interface SegmentHazard {
  segmentId: UUID;
  incidentType: IncidentType;

  /**
   * Incidents per million vehicle-hours on this segment, in this window.
   *
   * Millions because the raw figure is otherwise a string of leading zeros
   * that nobody can eyeball for sanity.
   */
  ratePerMillionVehicleHours: number;

  /** Hour-of-day window this rate applies to, 0-23. Null means all day. */
  activeFromHour: number | null;
  activeToHour: number | null;

  /**
   * 0-1 confidence in the rate.
   *
   * Driven by how many events it was computed from and how much exposure was
   * observed. A segment with two incidents and no exposure denominator has a
   * rate that is arithmetically enormous and epistemically worthless.
   */
  confidence: number;
  /** Confirmed events the rate was computed from. */
  observationCount: number;

  source: HazardSource;
  /**
   * True when the source is subject to reporting bias, which
   * `POLICE_STATISTICS` and `PARTNER_FEED` both are.
   *
   * Surfaced rather than silently corrected: the size of the bias is unknown
   * and area-dependent, so the honest handling is to lower confidence and say
   * why, not to apply an invented adjustment factor.
   */
  reportingBiasPossible: boolean;

  validFrom: ISODateString;
  validUntil: ISODateString | null;
  lastComputedAt: ISODateString;
}

// ============================================================================
// Traffic
// ============================================================================

/**
 * Observed transit time on a segment.
 *
 * Derived from the fleet's own telemetry rather than a third-party traffic
 * feed. That keeps it honest — these are times this operator's vehicles
 * actually achieved — and it degrades gracefully: a segment nobody has driven
 * has no estimate and falls back to free-flow, which is stated rather than
 * guessed.
 */
export interface SegmentTraffic {
  segmentId: UUID;
  /** Hour-of-day bucket, 0-23. */
  hourOfDay: number;
  /** Day-of-week bucket, 0 = Sunday. */
  dayOfWeek: number;

  /** Median observed transit time. Median, not mean — one breakdown skews a mean. */
  medianSeconds: number;
  /** 85th percentile. What a planner should quote, not the median. */
  p85Seconds: number;
  /** Observations behind the estimate. */
  sampleCount: number;
  /** Ratio of observed to free-flow. Above 1 is congestion. */
  congestionRatio: number;
  lastComputedAt: ISODateString;
}

// ============================================================================
// Routing
// ============================================================================

export interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  /** Intermediate stops, in order. */
  waypoints?: GeoPoint[];
  /** Departure time. Drives which hazard and traffic windows apply. */
  departAt: ISODateString;
  vehicleId: UUID | null;
  /**
   * How much extra travel time is acceptable to avoid risk.
   *
   * Bounded by `RoutingPolicy.maximumDetour*` regardless of what is asked for.
   * An unbounded risk-minimising router is not safer — it puts the driver on
   * the road for longer, which is itself exposure.
   */
  riskAversion?: RiskAversion;
}

/**
 * How the objective trades travel time against expected incidents.
 *
 * Expressed as **minutes per expected incident avoided**, which makes the
 * trade-off an explicit, arguable number rather than a hidden weight.
 *
 * The default corresponds to accepting roughly ten extra minutes of driving to
 * avoid a tenfold elevation in hijacking rate over an hour's trip. That figure
 * is a judgement about how much of a driver's time is worth their safety, it
 * belongs to the operator rather than to this codebase, and it is recorded on
 * every plan so a route can be explained afterwards.
 */
export const RiskAversion = {
  /** Time-first. For low-risk daytime routing. */
  LOW: 'LOW',
  STANDARD: 'STANDARD',
  /** Cash-in-transit, executive protection, night routes. */
  HIGH: 'HIGH',
} as const;
export type RiskAversion = (typeof RiskAversion)[keyof typeof RiskAversion];

/** One segment of a planned route, with what it costs and what it risks. */
export interface RouteLeg {
  segmentId: UUID;
  label: string;
  geometry: GeoPoint[];
  distanceMetres: number;
  /** Expected transit time at the planned departure time. */
  transitSeconds: number;
  /** Expected incidents on this leg — the hazard rate times the time on it. */
  expectedIncidents: number;
  /** Dominant hazard on this leg, when one stands out. */
  dominantHazard: IncidentType | null;
  /** 0-1 confidence in this leg's hazard estimate. */
  hazardConfidence: number;
}

/**
 * A costed route.
 *
 * `expectedIncidents` is the headline safety number, and like every other
 * probability in this platform it is small. A one-hour urban trip sits around
 * 1e-5. Displayed as a rate comparison against the alternative rather than as a
 * bare figure, because "0.00002" tells an operator nothing and "38% less
 * exposure than the fastest route" tells them what they need.
 */
export interface RouteCandidate {
  id: string;
  label: string;
  legs: RouteLeg[];

  totalDistanceMetres: number;
  totalTransitSeconds: number;
  /** Summed across legs. The quantity the objective minimises. */
  expectedIncidents: number;

  /** Objective value: transit minutes plus the risk term. Lower is better. */
  objectiveMinutes: number;

  /** Extra travel time against the fastest candidate, in seconds. */
  detourSeconds: number;
  /** Reduction in expected incidents against the fastest candidate, 0-1. */
  riskReduction: number;

  /** 0-1 mean confidence across the legs' hazard estimates. */
  confidence: number;
  /** Safe havens reachable from this route, for use during an incident. */
  havenCoverage: HavenCoverage;
}

/**
 * The chosen route and why.
 *
 * Persisted, because a route that put a driver somewhere may be examined later
 * and "the router chose it" is not an answer. The rejected candidates are kept
 * for the same reason the decision engine keeps losing hypotheses.
 */
export interface RoutePlan extends TenantScoped {
  id: UUID;
  vehicleId: UUID | null;
  driverId: UUID | null;

  chosen: RouteCandidate;
  /** The alternatives considered, including the fastest. */
  rejected: RouteCandidate[];

  riskAversion: RiskAversion;
  /** Minutes-per-incident value in force when this was planned. */
  riskAversionMinutesPerIncident: number;

  /** Why this candidate beat the others. Generated, not written. */
  rationale: string[];
  /** Constraints that bounded the choice, e.g. the detour cap biting. */
  constraints: string[];

  plannedAt: ISODateString;
  departAt: ISODateString;
  engineVersion: string;
  hazardCalibrationSource: string;

  /** Set when the plan was superseded by a recalculation. */
  supersededByPlanId: UUID | null;
  supersededReason: string | null;
}

// ============================================================================
// Safe havens
// ============================================================================

export const SafeHavenKind = {
  POLICE_STATION: 'POLICE_STATION',
  HOSPITAL: 'HOSPITAL',
  /** A staffed, lit, camera-covered fuel station. */
  FUEL_STATION: 'FUEL_STATION',
  /** An armed-response company's base. */
  SECURITY_BASE: 'SECURITY_BASE',
  /** A depot or client site belonging to the operator. */
  OWN_PREMISES: 'OWN_PREMISES',
  /** A shopping centre or similar with security and cameras. */
  PUBLIC_SECURE_SITE: 'PUBLIC_SECURE_SITE',
} as const;
export type SafeHavenKind = (typeof SafeHavenKind)[keyof typeof SafeHavenKind];

/**
 * Somewhere a driver can stop when something is wrong.
 *
 * Note what this is and is not. It is a **refuge during an incident** — where
 * to send a vehicle whose driver has pressed the panic button. It is *not* a
 * filter on where a vehicle may be dispatched, and there is no field here that
 * could make it one. Confusing the two is precisely how a safety feature turns
 * into a service exclusion.
 */
export interface SafeHaven extends TenantScoped {
  id: UUID;
  kind: SafeHavenKind;
  name: string;
  position: GeoPoint;
  address: string;

  /** Whether it is staffed around the clock. */
  isTwentyFourHour: boolean;
  openFromHour: number | null;
  openToHour: number | null;

  hasArmedSecurity: boolean;
  hasCctv: boolean;
  hasLighting: boolean;
  /** Whether the operator has an arrangement with the site. */
  hasStandingArrangement: boolean;

  contactNumber: string | null;
  /** When someone last confirmed this place still exists and still qualifies. */
  lastVerifiedAt: ISODateString | null;
  isActive: boolean;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** A haven ranked against a specific position. */
export interface RankedHaven {
  haven: SafeHaven;
  distanceMetres: number;
  /** Estimated driving time, from traffic where known. */
  etaSeconds: number;
  /** Whether it is open at the relevant time. */
  openNow: boolean;
  /** 0-1 suitability, from kind, facilities, opening hours and distance. */
  suitability: number;
  /** Why it ranked where it did. */
  reasons: string[];
}

export interface HavenCoverage {
  /** Havens within reach along the route. */
  reachableCount: number;
  /** Longest stretch of the route with no haven within reach, in seconds. */
  longestGapSeconds: number;
  /**
   * True when the longest gap exceeds the policy maximum.
   *
   * A route can be low-risk and still be a bad route: an hour of open road
   * with nowhere to stop is a worse place to have a problem than a slightly
   * riskier road past three fuel stations.
   */
  hasUncoveredStretch: boolean;
}

// ============================================================================
// Recalculation
// ============================================================================

export const RecalculationTrigger = {
  /** A new hazard appeared on the planned route. */
  HAZARD_EMERGED: 'HAZARD_EMERGED',
  /** Congestion made the planned route materially slower. */
  TRAFFIC_DEGRADED: 'TRAFFIC_DEGRADED',
  /** A road authority closed a segment on the route. */
  ROAD_CLOSED: 'ROAD_CLOSED',
  /** The vehicle left the planned route. */
  OFF_ROUTE: 'OFF_ROUTE',
  /** The Threat Decision Engine raised something. */
  THREAT_DECISION: 'THREAT_DECISION',
  /** An operator asked for it. */
  OPERATOR_REQUEST: 'OPERATOR_REQUEST',
} as const;
export type RecalculationTrigger = (typeof RecalculationTrigger)[keyof typeof RecalculationTrigger];

/**
 * When a route may be recalculated, and how often.
 *
 * The hysteresis is the point. A router that re-plans on every telemetry frame
 * sends a driver a new instruction every few seconds, and a driver who is being
 * re-routed constantly stops following the routing — which leaves them worse
 * off than a slightly stale route would have.
 */
export interface RecalculationPolicy {
  /** Minimum seconds between recalculations, absent a high-severity trigger. */
  minimumIntervalSeconds: number;
  /** Improvement in objective minutes required before a re-route is offered. */
  minimumImprovementMinutes: number;
  /** Metres off the planned line before `OFF_ROUTE` fires. */
  offRouteToleranceMetres: number;
  /**
   * Triggers that bypass the interval and the improvement floor.
   *
   * A closed road and a live threat are not improvements to be weighed; they
   * are reasons the current route is no longer viable.
   */
  immediateTriggers: RecalculationTrigger[];
}

// ============================================================================
// Police route sharing
// ============================================================================

/**
 * A time-bounded grant of route visibility to law enforcement.
 *
 * ## Why this is a grant and not a feed
 *
 * Continuous location sharing of a worker with the police is not a feature, it
 * is surveillance with an extra step. The driver is an employee going about
 * their job, and most of the time there is nothing for law enforcement to see.
 *
 * So sharing is: **scoped to one incident, bounded in time, revocable, audited,
 * and never standing.** A grant that has expired stops resolving. There is no
 * type in this file for a persistent police subscription, and adding one would
 * be the change to argue about.
 *
 * The one case that justifies it is real and worth building for: a vehicle is
 * being hijacked, and the officers who might intercept it need to know where it
 * is going. That case has an incident attached, which is exactly why the grant
 * requires one.
 */
export interface PoliceRouteShare extends TenantScoped {
  id: UUID;
  /** Required. There is no incident-free sharing. */
  incidentId: UUID;
  vehicleId: UUID;
  routePlanId: UUID | null;

  /** The receiving unit or station, as identified by the operator granting it. */
  recipientReference: string;
  /** Written justification. Required, and audited. */
  justification: string;

  grantedByUserId: UUID;
  grantedAt: ISODateString;
  /** Hard expiry. A grant cannot be open-ended. */
  expiresAt: ISODateString;

  revokedAt: ISODateString | null;
  revokedByUserId: UUID | null;

  /** Every resolution of the grant, for the audit trail. */
  accessCount: number;
  lastAccessedAt: ISODateString | null;

  /**
   * Always `true`. Live position is shared only while the grant is live and the
   * incident is open; the moment either ends, the feed stops resolving.
   */
  expiresWithIncident: true;
}

// ============================================================================
// Equity
// ============================================================================

/**
 * What the router's risk avoidance cost, per trip.
 *
 * ## Why this is recorded at all
 *
 * Because the harm from crime-avoidance routing is invisible from inside the
 * system that causes it. Each individual detour looks reasonable. The pattern —
 * that trips to certain destinations consistently cost more, get quoted longer,
 * or get declined — only appears in aggregate, and only if someone is counting.
 *
 * So the router counts. `detourSecondsAttributable` is the time this trip spent
 * avoiding hazard rather than travelling, and it is aggregated by destination
 * area for review. If serving a place systematically costs more, that shows up
 * as a number an operator has to look at, rather than as a slow drift in which
 * destinations get served.
 *
 * The destination grouping used for review is a coarse geographic cell, chosen
 * deliberately: it is enough to detect a pattern and not enough to profile a
 * customer.
 */
export interface RoutingEquityRecord {
  routePlanId: UUID;
  /** Coarse geographic cell of the destination. Never an address. */
  destinationCell: string;
  /** Fastest-route time, in seconds. The counterfactual. */
  baselineSeconds: number;
  /** Chosen-route time. */
  chosenSeconds: number;
  /** The difference. The number that matters. */
  detourSecondsAttributable: number;
  /** Reduction in expected incidents the detour bought, 0-1. */
  riskReduction: number;
  recordedAt: ISODateString;
}

/** Aggregated detour burden by destination cell, for periodic review. */
export interface RoutingEquityReport {
  windowDays: number;
  cells: Array<{
    destinationCell: string;
    tripCount: number;
    medianDetourSeconds: number;
    /** Median detour as a fraction of baseline. The comparable figure. */
    medianDetourRatio: number;
    medianRiskReduction: number;
  }>;
  /**
   * Cells whose detour burden is a substantial outlier.
   *
   * Flagged for a human to look at, never acted on automatically. The
   * appropriate response might be to change the routing, to add a safe haven,
   * or to accept the cost — and that is a decision for people, not for the
   * router that caused it.
   */
  outlierCells: string[];
  note: string;
}

// ============================================================================
// Policy
// ============================================================================

/**
 * The constraints the router operates under.
 *
 * Three fields are typed as literals so that changing any of them is a
 * deliberate type change visible in review rather than a config edit.
 */
export interface RoutingPolicy {
  /**
   * Always `true`. A destination is never avoided, downgraded or declined on
   * risk grounds, however hazardous the roads around it.
   *
   * Risk avoidance applies to *through-traffic* only: which of several ways to
   * reach a place. Refusing to reach it at all is the redlining this whole
   * design exists to prevent.
   */
  neverExcludeDestination: true;

  /**
   * Always `false`. Routing never uses individual-level data — no watchlists,
   * no known-offender proximity, no person-linked geography.
   *
   * `ThreatEventType.KNOWN_OFFENDER_PROXIMITY` exists in the platform for
   * incident annotation. Routing on it would make this a system that steers
   * vehicles away from named individuals, which is a different product with a
   * different set of harms.
   */
  permitIndividualLevelAvoidance: false;

  /**
   * Always `false`. The platform's own alerts never become hazard data.
   * Only human-confirmed incidents do. See `HazardSource`.
   */
  permitSelfReinforcingHazardData: false;

  /**
   * Extra travel time allowed, as a fraction of the fastest route.
   *
   * The allowance is `max(maximumDetourRatio × fastest,
   * minimumDetourAllowanceSeconds)`, then capped at `maximumDetourSeconds`.
   *
   * All three are needed. A ratio alone is far too tight on short trips — 25%
   * of a 30-minute run is seven minutes, which rejects almost every worthwhile
   * detour. A floor alone is too permissive on long ones. And without the
   * absolute ceiling, a four-hour trip could grow by an hour.
   */
  maximumDetourRatio: number;
  /** Floor on the allowance, so short trips are not over-constrained. */
  minimumDetourAllowanceSeconds: number;
  /** Hard ceiling on extra travel time, whatever the ratio and floor produce. */
  maximumDetourSeconds: number;
  /** Longest acceptable stretch with no safe haven in reach, in seconds. */
  maximumHavenGapSeconds: number;
  /** Minimum hazard confidence before a hazard may influence routing at all. */
  minimumHazardConfidence: number;
}
