import { createHash, randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AccessTokenClaims, AuthUser, RefreshTokenClaims } from '@aegisdrive/types';
import { ErrorCode, UnauthorizedError } from '@aegisdrive/shared';
import { env } from '../../config/env';

/**
 * Token minting and verification.
 *
 * Access and refresh tokens are signed with *different* secrets and carry a
 * `typ` claim. Either alone would be enough to stop a refresh token being
 * presented as an access token; both together mean the mistake cannot be made
 * even if one secret leaks.
 */

interface AccessTokenPayload {
  organizationId: string;
  roles: AuthUser['roles'];
  permissions: AuthUser['permissions'];
  typ: 'access';
}

interface RefreshTokenPayload {
  sid: string;
  typ: 'refresh';
}

export function signAccessToken(user: AuthUser): { token: string; expiresIn: number } {
  const payload: AccessTokenPayload = {
    organizationId: user.organizationId,
    roles: user.roles,
    permissions: user.permissions,
    typ: 'access',
  };

  const options: SignOptions = {
    subject: user.id,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  };

  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  const expiresIn = decoded?.exp && decoded.iat ? decoded.exp - decoded.iat : 900;

  return { token, expiresIn };
}

export interface IssuedRefreshToken {
  token: string;
  /** Server-side session id embedded in the token. */
  sessionId: string;
  expiresAt: Date;
  /** SHA-256 of the token; this is what gets persisted. */
  tokenHash: string;
}

export function signRefreshToken(userId: string): IssuedRefreshToken {
  const sessionId = randomUUID();
  const payload: RefreshTokenPayload = { sid: sessionId, typ: 'refresh' };

  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    subject: userId,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });

  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  return { token, sessionId, expiresAt, tokenHash: hashToken(token) };
}

/**
 * SHA-256, not bcrypt.
 *
 * Refresh tokens are already 256+ bits of signed entropy, so there is nothing
 * to brute-force and a slow KDF would only add latency to every refresh. The
 * hash exists so a database dump does not yield usable tokens.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as AccessTokenClaims;

    if (claims.typ !== 'access') {
      throw new UnauthorizedError('Wrong token type.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    return claims;
  } catch (error) {
    throw toAuthError(error);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  try {
    const claims = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as RefreshTokenClaims;

    if (claims.typ !== 'refresh') {
      throw new UnauthorizedError('Wrong token type.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    return claims;
  } catch (error) {
    throw toAuthError(error);
  }
}

function toAuthError(error: unknown): UnauthorizedError {
  if (error instanceof UnauthorizedError) return error;

  if (error instanceof jwt.TokenExpiredError) {
    return new UnauthorizedError('The token has expired.', ErrorCode.AUTH_TOKEN_EXPIRED);
  }

  return new UnauthorizedError('The token is invalid.', ErrorCode.AUTH_TOKEN_INVALID);
}
