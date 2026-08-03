import { PERMISSIONS, RoleName, type Permission } from '@aegisdrive/types';

/**
 * The authorisation policy of AEGISDRIVE AI.
 *
 * This matrix is the single source of truth. The API seeds the `Role` table
 * from it, the API enforces it per-route, and the web client uses it only to
 * hide affordances — never as a security boundary. A permission absent here
 * cannot be granted at runtime.
 */

/** Full control. Reserved for tenant administrators. */
const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/**
 * Command-centre operator. Runs day-to-day monitoring and incident triage but
 * cannot alter tenancy, users or roles.
 */
const OPERATOR_PERMISSIONS: readonly Permission[] = [
  'dashboard:read',
  'fleet:read',
  'fleet:manage',
  'vehicle:read',
  'vehicle:create',
  'vehicle:update',
  'driver:read',
  'driver:create',
  'driver:update',
  'incident:read',
  'incident:create',
  'incident:update',
  'incident:escalate',
  'incident:resolve',
  'incident:dispatch',
  'evidence:read',
  'evidence:upload',
  'alert:read',
  'alert:acknowledge',
  'alert:suppress',
  'notification:read',
  'notification:send',
  'telemetry:read',
  'threat:read',
  'analytics:read',
  // Reads the confidence score to triage; cannot enrol anyone's biometrics.
  'identity:read',
  // Reads cabin behaviour assessments while triaging. Cannot alter calibration.
  'behaviour:read',
  // Reads cabin detections and counts, and rules on weapon candidates — the
  // control room is where that review happens. Live interior video is included
  // because triaging an incident in progress needs it, but it stays a separate
  // permission so it can be withdrawn without blinding the operator entirely.
  'cabin:read',
  'cabin:review',
  'cabin:stream',
  // Reads the engine's decisions and may record a disagreement. The control
  // room is where the engine is actually held to account.
  'decision:read',
  'decision:override',
  // Plans routes and, during an incident, grants police visibility of one.
  // The grant is incident-scoped, time-bounded and audited.
  'corridor:read',
  'corridor:plan',
  'corridor:share-police',
  // Runs the silent-emergency response: reads activations, takes and stands them
  // down, and fans them out to police, security, family and the insurer. Does
  // not hold `sos:activate` — an operator does not covertly trigger from a
  // cabin; the control room receives, it does not raise.
  'sos:read',
  'sos:manage',
  'sos:dispatch',
  // Runs vehicle recovery end to end: opens cases, adds sightings, deploys
  // searchers, draws geofences and tasks aerial support.
  'recovery:read',
  'recovery:manage',
  'recovery:track',
  'recovery:dispatch',
  'user:read',
  'organization:read',
  'settings:read',
];

/**
 * Armed-response and security control. Adds the countermeasure permissions an
 * operator deliberately does not hold.
 */
const SECURITY_PERMISSIONS: readonly Permission[] = [
  'dashboard:read',
  'fleet:read',
  'vehicle:read',
  'vehicle:update',
  'vehicle:immobilise',
  'driver:read',
  'incident:read',
  'incident:create',
  'incident:update',
  'incident:escalate',
  'incident:resolve',
  'incident:dispatch',
  'evidence:read',
  'evidence:upload',
  'evidence:export',
  'alert:read',
  'alert:acknowledge',
  'notification:read',
  'notification:send',
  'telemetry:read',
  'threat:read',
  'analytics:read',
  'identity:read',
  'behaviour:read',
  'cabin:read',
  'cabin:review',
  'cabin:stream',
  'decision:read',
  'decision:override',
  'corridor:read',
  'corridor:plan',
  'corridor:share-police',
  // Armed response is on the receiving end of a dispatch and also runs it: reads
  // activations, takes them, and fans them out. Same emergency grants as the
  // operator.
  'sos:read',
  'sos:manage',
  'sos:dispatch',
  // Armed recovery: same coordination grants as the operator. Interception is
  // exactly this role's job.
  'recovery:read',
  'recovery:manage',
  'recovery:track',
  'recovery:dispatch',
  'settings:read',
];

/**
 * Law-enforcement liaison. Read and export only: an external principal must
 * never be able to mutate operational state or see tenant administration.
 */
const POLICE_PERMISSIONS: readonly Permission[] = [
  'dashboard:read',
  'fleet:read',
  'vehicle:read',
  'driver:read',
  'incident:read',
  'incident:update',
  'evidence:read',
  'evidence:export',
  'alert:read',
  'telemetry:read',
  'threat:read',
  // Granted deliberately. An officer investigating a hijacking needs to see the
  // evidence that justified the dispatch, and withholding it would make the
  // decision unexaminable by the one party with the standing to question it.
  // Note there is no `behaviour:export` for anyone — the incident record is the
  // export path, and it is scoped to a single incident.
  'behaviour:read',
  // Detections and counts, so the evidence behind a dispatch is examinable.
  // Deliberately not `cabin:stream`: an external principal watching live
  // interior video of a driver is a different and much larger intrusion than
  // reviewing the record of a specific incident, and the incident's sealed
  // media is already available through the evidence export path.
  'cabin:read',
  // The reasoning behind a dispatch, including the hypotheses that were
  // rejected. Read-only: an external principal must not be able to rewrite the
  // engine's record of what it concluded.
  'decision:read',
  // Reads a route that has been shared with them under a live grant. Holding
  // `corridor:read` does not by itself resolve any route — the grant does, and
  // it expires. Deliberately not `corridor:share-police`: the party receiving
  // the visibility must not also be the party authorising it.
  'corridor:read',
  // Reads recovery cases and the stolen-vehicle track: an officer who might
  // intercept a stolen vehicle needs to know where it was last seen. Read-only —
  // an external principal coordinates nothing and cannot alter the track.
  'recovery:read',
];

/**
 * Vehicle driver, normally on the mobile app. Scoped further at the query layer
 * to the driver's own vehicle and incidents; these permissions only open the
 * routes.
 */
const DRIVER_PERMISSIONS: readonly Permission[] = [
  'vehicle:read',
  'driver:read',
  'incident:read',
  'incident:create',
  'evidence:upload',
  'alert:read',
  'notification:read',
  'telemetry:ingest',
  // Submits device attestation and interaction signals from their own phone.
  'identity:submit',
  // Submits cabin and control signals from their own vehicle. Deliberately
  // submit-only: a driver cannot read their own behaviour assessments, because
  // a driver who can see the engine's output can also see when it has noticed
  // something — and if they are being coerced, so can whoever is beside them.
  'behaviour:submit',
  // No cabin permission at all, for the same reason. The driver app does not
  // ingest cabin perception — the in-vehicle pipeline submits under the AI
  // gateway's service account, not the driver's token.
  //
  // Reads their own planned route, because a route the driver cannot see is
  // not navigation. Scoped to their own vehicle at the query layer.
  'corridor:read',
  // Raises a silent SOS, and cannot read one. Submit-only for the same reason
  // `behaviour:submit` is: a driver who can see the engine's response can also
  // see when it has responded, and if they are being coerced, so can whoever is
  // beside them. The alarm goes out; nothing comes back to the cabin.
  'sos:activate',
];

/** Risk and intelligence analyst. Broad read, plus threat model curation. */
const ANALYST_PERMISSIONS: readonly Permission[] = [
  'dashboard:read',
  'fleet:read',
  'vehicle:read',
  'driver:read',
  'incident:read',
  'evidence:read',
  'alert:read',
  'telemetry:read',
  'threat:read',
  'threat:manage',
  // Reviews assessment quality and demographic parity; cannot enrol.
  'identity:read',
  // Curates signal calibration and audits false-positive rates. This is the
  // role that must refit the placeholder likelihood ratios before production.
  'behaviour:read',
  'behaviour:manage',
  // Audits detector false-positive rates, including the weapon detector's.
  // No `cabin:review` — an analyst studying aggregate accuracy should not also
  // be ruling on live candidates — and no `cabin:stream`.
  'cabin:read',
  'cabin:manage',
  // Reviews decision quality and override rates — the role that must refit the
  // priors and likelihood tables before production.
  'decision:read',
  // Curates segment hazard data and reviews the routing equity report — the
  // role responsible for noticing when risk avoidance has become service
  // exclusion.
  'corridor:read',
  'corridor:manage',
  // Reads activations to audit the false-alarm rate per activation method — the
  // number that says whether the dead-man timeout or the duress phrase is firing
  // on people who are fine. Cannot act on an alarm or dispatch one.
  'sos:read',
  // Reads recovery cases to report the fleet's recovery rate and mean time to
  // recover. Cannot run a recovery or task an asset.
  'recovery:read',
  'analytics:read',
  'analytics:export',
  'audit:read',
  'audit:export',
  'settings:read',
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleName, readonly Permission[]>> = Object.freeze({
  [RoleName.ADMIN]: ADMIN_PERMISSIONS,
  [RoleName.OPERATOR]: OPERATOR_PERMISSIONS,
  [RoleName.SECURITY]: SECURITY_PERMISSIONS,
  [RoleName.POLICE]: POLICE_PERMISSIONS,
  [RoleName.DRIVER]: DRIVER_PERMISSIONS,
  [RoleName.ANALYST]: ANALYST_PERMISSIONS,
});

export interface RoleDefinition {
  name: RoleName;
  displayName: string;
  description: string;
  permissions: readonly Permission[];
}

/** Human-facing role catalogue, used by the seed script and the Roles page. */
export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    name: RoleName.ADMIN,
    displayName: 'Administrator',
    description: 'Full tenant control including users, roles, billing and system settings.',
    permissions: ROLE_PERMISSIONS[RoleName.ADMIN],
  },
  {
    name: RoleName.OPERATOR,
    displayName: 'Control Room Operator',
    description: 'Monitors the fleet, triages alerts and manages incidents end to end.',
    permissions: ROLE_PERMISSIONS[RoleName.OPERATOR],
  },
  {
    name: RoleName.SECURITY,
    displayName: 'Security Response',
    description: 'Armed response and countermeasures, including remote immobilisation.',
    permissions: ROLE_PERMISSIONS[RoleName.SECURITY],
  },
  {
    name: RoleName.POLICE,
    displayName: 'Law Enforcement',
    description: 'External liaison with read and evidence-export access only.',
    permissions: ROLE_PERMISSIONS[RoleName.POLICE],
  },
  {
    name: RoleName.DRIVER,
    displayName: 'Driver',
    description: 'Mobile principal, scoped to their own vehicle, trips and panic actions.',
    permissions: ROLE_PERMISSIONS[RoleName.DRIVER],
  },
  {
    name: RoleName.ANALYST,
    displayName: 'Risk Analyst',
    description: 'Read-only across operations, with analytics export and threat curation.',
    permissions: ROLE_PERMISSIONS[RoleName.ANALYST],
  },
];
