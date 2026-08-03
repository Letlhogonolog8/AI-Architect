import type { RequestHandler } from 'express';
import { ErrorCode, UnauthorizedError } from '@aegisdrive/shared';
import { UserStatus } from '@aegisdrive/types';
import { getContext } from '../core/request-context';
import { verifyAccessToken } from '../modules/auth/token.service';
import { loadAuthUser } from '../modules/auth/auth.repository';

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the access token and attaches the principal.
 *
 * The principal is re-read from the database rather than trusted wholesale from
 * the token, so a suspension or a role change takes effect on the next request
 * instead of at the end of the token's lifetime. The read is cached for
 * `CacheTtlSeconds.userPermissions`, which bounds the staleness explicitly.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.header('authorization'));
    if (!token) {
      throw new UnauthorizedError('An access token is required.');
    }

    const claims = verifyAccessToken(token);
    const user = await loadAuthUser(claims.sub);

    if (!user) {
      throw new UnauthorizedError('The account no longer exists.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('This account is not active.', ErrorCode.AUTH_SESSION_REVOKED);
    }

    // A token minted before the user was moved between tenants must not carry
    // the old organization scope into the new one.
    if (user.organizationId !== claims.organizationId) {
      throw new UnauthorizedError(
        'The session is no longer valid for this organization.',
        ErrorCode.AUTH_SESSION_REVOKED,
      );
    }

    req.user = user;

    const context = getContext();
    if (context) context.user = user;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Attaches the principal when a valid token is present but never rejects.
 * Used by endpoints whose response is richer for a signed-in caller.
 */
export const optionalAuthenticate: RequestHandler = async (req, res, next) => {
  if (!extractBearerToken(req.header('authorization'))) {
    next();
    return;
  }

  authenticate(req, res, (error?: unknown) => {
    next(error instanceof Error && 'statusCode' in error ? undefined : error);
  });
};
