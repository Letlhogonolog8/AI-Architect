import type { AuthUser, LoginResponse, SessionSummary, TokenPair } from '@aegisdrive/types';
import { AuditAction, UserStatus } from '@aegisdrive/types';
import {
  ErrorCode,
  ForbiddenError,
  LOGIN_LOCKOUT_SECONDS,
  MAX_LOGIN_ATTEMPTS,
  UnauthorizedError,
} from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import {
  createSession,
  findActiveSessionByToken,
  findAnySessionByToken,
  findCredentialsByEmail,
  invalidateAuthUser,
  listSessionsForUser,
  loadAuthUser,
  recordLoginFailure,
  recordLoginSuccess,
  revokeAllSessionsForUser,
  revokeSession,
} from './auth.repository';
import { needsRehash, verifyPassword } from './password.service';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service';

const log = moduleLogger('auth');

export interface RequestFingerprint {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Authenticates a credential pair and opens a session.
 *
 * Every failure path returns the same message and the same error code. The
 * caller learns only that the attempt failed — never whether the address
 * exists, is suspended, or is locked out — because that difference is how
 * account enumeration works.
 */
export async function login(
  email: string,
  password: string,
  fingerprint: RequestFingerprint,
): Promise<LoginResponse> {
  const genericFailure = new UnauthorizedError(
    'Incorrect email address or password.',
    ErrorCode.AUTH_INVALID_CREDENTIALS,
  );

  const credentials = await findCredentialsByEmail(email);

  // Still hashes on the miss path so timing does not reveal the account exists.
  const passwordMatches = await verifyPassword(password, credentials?.password ?? null);

  if (!credentials || !passwordMatches) {
    if (credentials) {
      await handleFailedAttempt(
        credentials.id,
        credentials.failedLoginCount,
        credentials.organizationId,
        email,
        fingerprint,
      );
    }
    throw genericFailure;
  }

  if (credentials.lockedUntil && credentials.lockedUntil > new Date()) {
    throw genericFailure;
  }

  if (credentials.status !== UserStatus.ACTIVE) {
    await recordAudit({
      organizationId: credentials.organizationId,
      actorUserId: credentials.id,
      actorEmail: email,
      action: AuditAction.LOGIN_FAILED,
      resourceType: 'session',
      ipAddress: fingerprint.ipAddress,
      userAgent: fingerprint.userAgent,
      metadata: { reason: 'ACCOUNT_NOT_ACTIVE', status: credentials.status },
    });
    throw genericFailure;
  }

  const user = await loadAuthUser(credentials.id);
  if (!user) throw genericFailure;

  if (needsRehash(credentials.password)) {
    // Surfaced rather than silently rehashed: raising the cost factor is an
    // operational decision, and rehashing inside a login adds latency to the
    // one request users notice most.
    log.info({ userId: user.id }, 'Password digest is below current cost policy');
  }

  const tokens = await issueTokens(user, fingerprint);
  await recordLoginSuccess(user.id);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.LOGIN,
    resourceType: 'session',
    ipAddress: fingerprint.ipAddress,
    userAgent: fingerprint.userAgent,
  });

  return { user, tokens };
}

async function handleFailedAttempt(
  userId: string,
  currentFailures: number,
  organizationId: string,
  email: string,
  fingerprint: RequestFingerprint,
): Promise<void> {
  const nextFailureCount = currentFailures + 1;
  const shouldLock = nextFailureCount >= MAX_LOGIN_ATTEMPTS;
  const lockUntil = shouldLock ? new Date(Date.now() + LOGIN_LOCKOUT_SECONDS * 1000) : null;

  await recordLoginFailure(userId, lockUntil);

  void recordAudit({
    organizationId,
    actorUserId: userId,
    actorEmail: email,
    action: AuditAction.LOGIN_FAILED,
    resourceType: 'session',
    ipAddress: fingerprint.ipAddress,
    userAgent: fingerprint.userAgent,
    metadata: { attempt: nextFailureCount, locked: shouldLock },
  });

  if (shouldLock) {
    log.warn({ userId, attempts: nextFailureCount }, 'Account locked after repeated failures');
  }
}

async function issueTokens(user: AuthUser, fingerprint: RequestFingerprint): Promise<TokenPair> {
  const access = signAccessToken(user);
  const refresh = signRefreshToken(user.id);

  await createSession({
    userId: user.id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    ipAddress: fingerprint.ipAddress,
    userAgent: fingerprint.userAgent,
  });

  return {
    accessToken: access.token,
    expiresIn: access.expiresIn,
    refreshToken: refresh.token,
  };
}

/**
 * Rotates a refresh token.
 *
 * Rotation is single-use: the presented token is revoked and a new one issued.
 * Presenting an already-revoked token means either a stolen token is being
 * replayed or the legitimate client raced itself — both are treated as
 * compromise, and every session for that user is destroyed.
 */
export async function refresh(
  refreshToken: string,
  fingerprint: RequestFingerprint,
): Promise<TokenPair> {
  const claims = verifyRefreshToken(refreshToken);
  const session = await findActiveSessionByToken(refreshToken);

  if (!session) {
    const replayed = await findAnySessionByToken(refreshToken);

    if (replayed?.revokedAt) {
      const revokedCount = await revokeAllSessionsForUser(replayed.userId);
      log.error(
        { userId: replayed.userId, revokedCount },
        'Refresh token replay detected; all sessions revoked',
      );

      const user = await loadAuthUser(replayed.userId);
      if (user) {
        void recordAudit({
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: AuditAction.PERMISSION_DENIED,
          resourceType: 'session',
          resourceId: replayed.id,
          ipAddress: fingerprint.ipAddress,
          userAgent: fingerprint.userAgent,
          metadata: { reason: 'REFRESH_TOKEN_REPLAY', revokedCount },
        });
      }
    }

    throw new UnauthorizedError('The session is no longer valid.', ErrorCode.AUTH_SESSION_REVOKED);
  }

  if (session.userId !== claims.sub) {
    throw new UnauthorizedError('The session is no longer valid.', ErrorCode.AUTH_SESSION_REVOKED);
  }

  const user = await loadAuthUser(session.userId);
  if (!user || user.status !== UserStatus.ACTIVE) {
    await revokeSession(session.id);
    throw new UnauthorizedError('The account is no longer active.', ErrorCode.AUTH_SESSION_REVOKED);
  }

  const tokens = await issueTokens(user, fingerprint);
  await revokeSession(session.id);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.TOKEN_REFRESH,
    resourceType: 'session',
    resourceId: session.id,
    ipAddress: fingerprint.ipAddress,
    userAgent: fingerprint.userAgent,
  });

  return tokens;
}

/** Ends one session. A missing or already-revoked token is not an error. */
export async function logout(refreshToken: string | undefined, user: AuthUser): Promise<void> {
  if (refreshToken) {
    const session = await findActiveSessionByToken(refreshToken);
    if (session) await revokeSession(session.id);
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.LOGOUT,
    resourceType: 'session',
  });
}

/** Ends every session for the principal. Used by "sign out of all devices". */
export async function logoutEverywhere(user: AuthUser): Promise<number> {
  const revokedCount = await revokeAllSessionsForUser(user.id);
  await invalidateAuthUser(user.id);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.LOGOUT,
    resourceType: 'session',
    metadata: { scope: 'ALL_DEVICES', revokedCount },
  });

  return revokedCount;
}

export async function listSessions(user: AuthUser): Promise<SessionSummary[]> {
  const rows = await listSessionsForUser(user.id);

  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }));
}

/** Revokes one named session. Callers may only revoke their own. */
export async function revokeOwnSession(user: AuthUser, sessionId: string): Promise<void> {
  const sessions = await listSessionsForUser(user.id);
  const owned = sessions.some((session) => session.id === sessionId);

  if (!owned) {
    throw new ForbiddenError('That session does not belong to you.');
  }

  await revokeSession(sessionId);
}
