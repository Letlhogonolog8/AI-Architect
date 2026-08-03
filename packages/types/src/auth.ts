import type { ISODateString, UUID } from './common';
import type { RoleName, UserStatus } from './enums';

/**
 * Permissions are `<resource>:<action>` strings. Keeping them as a closed union
 * means a typo in a route guard is a compile error rather than a silent
 * authorisation bypass.
 */
export const PERMISSIONS = [
  'dashboard:read',

  'fleet:read',
  'fleet:manage',

  'vehicle:read',
  'vehicle:create',
  'vehicle:update',
  'vehicle:delete',
  'vehicle:immobilise',

  'driver:read',
  'driver:create',
  'driver:update',
  'driver:delete',

  'incident:read',
  'incident:create',
  'incident:update',
  'incident:escalate',
  'incident:resolve',
  'incident:dispatch',

  'evidence:read',
  'evidence:upload',
  'evidence:export',
  'evidence:purge',

  'alert:read',
  'alert:acknowledge',
  'alert:suppress',

  'notification:read',
  'notification:send',

  'telemetry:read',
  'telemetry:ingest',

  'threat:read',
  'threat:manage',

  // Continuous Identity Engine. Split finely because the capabilities differ
  // sharply in sensitivity: reading a confidence score is routine operations,
  // enrolling someone's face is processing special-category personal data.
  'identity:read',
  'identity:submit',
  'identity:enrol',
  'identity:manage',

  // Behaviour Intelligence Engine. Split on the same principle as identity.
  // Note what is absent: there is no `behaviour:export`. These signals are
  // processed on a safety basis for the protection of the data subject, and
  // there is no export path because bulk extraction has no safety purpose —
  // only a performance-management one, which is a prohibited use.
  'behaviour:read',
  'behaviour:submit',
  'behaviour:manage',

  // Cabin Intelligence Engine. Split five ways because the capabilities differ
  // enormously in how invasive they are: reading "3 occupants" and watching a
  // live feed of a person's face for an hour are not the same act.
  //
  // `cabin:review` exists because confirming a weapon converts a detector
  // output with a typically sub-one-percent posterior into grounds for an armed
  // response. That is not routine triage.
  //
  // `cabin:stream` gates live interior video. Note there is no
  // `cabin:export` — media leaves only through the evidence chain of custody,
  // scoped to an incident.
  'cabin:read',
  'cabin:submit',
  'cabin:review',
  'cabin:manage',
  'cabin:stream',

  // Threat Decision Engine. Only two, because the engine decides rather than
  // acts: everything it recommends is committed through the permission the
  // action itself requires (`incident:dispatch`, `vehicle:immobilise`, ...).
  //
  // `decision:override` is separate from `decision:read` because recording a
  // disagreement with the engine is an accountable act, and because override
  // rates are the platform's best calibration signal — they should come from
  // people whose judgement is answerable, not from anyone with a login.
  'decision:read',
  'decision:override',

  // SafeCorridor. `corridor:share-police` is separate from everything else
  // because granting law enforcement visibility of a worker's live route is a
  // categorically different act from planning one, and it should be held by
  // fewer people. Note there is no `corridor:exclude` — a destination is never
  // avoided, so there is no permission that could authorise it.
  'corridor:read',
  'corridor:plan',
  'corridor:manage',
  'corridor:share-police',

  'analytics:read',
  'analytics:export',

  'user:read',
  'user:create',
  'user:update',
  'user:delete',

  'role:read',
  'role:manage',

  'organization:read',
  'organization:manage',

  'audit:read',
  'audit:export',

  'settings:read',
  'settings:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The authenticated principal, as resolved from a verified access token. */
export interface AuthUser {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: UUID;
  status: UserStatus;
  roles: RoleName[];
  permissions: Permission[];
}

/** Claims embedded in a signed access token. */
export interface AccessTokenClaims {
  sub: UUID;
  organizationId: UUID;
  roles: RoleName[];
  permissions: Permission[];
  /** Token type discriminator; guards against refresh-for-access confusion. */
  typ: 'access';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/** Claims embedded in a signed refresh token. */
export interface RefreshTokenClaims {
  sub: UUID;
  /** Server-side session identifier, revocable independently of the user. */
  sid: UUID;
  typ: 'refresh';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface TokenPair {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: TokenPair;
}

export interface RefreshRequest {
  refreshToken: string;
}

export type RefreshResponse = TokenPair;

export interface SessionSummary {
  id: UUID;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: ISODateString;
  expiresAt: ISODateString;
  revokedAt: ISODateString | null;
}
