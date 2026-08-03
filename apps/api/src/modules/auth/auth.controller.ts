import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_TOKEN_COOKIE, UnauthorizedError } from '@aegisdrive/shared';
import { asyncHandler, clientIp, sendNoContent, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import { env, isProduction } from '../../config/env';
import * as authService from './auth.service';
import type { LoginInput, RefreshInput } from './auth.schema';

/**
 * Refresh tokens travel in an httpOnly cookie so that XSS in the web client
 * cannot read them. `sameSite: 'lax'` is safe here because the refresh endpoint
 * is POST-only and CORS is origin-pinned; `strict` would break the OAuth-style
 * redirect flows planned for the police portal.
 */
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}

function readRefreshToken(req: Request, body?: RefreshInput): string | undefined {
  const cookieValue = (req.cookies as Record<string, string> | undefined)?.[REFRESH_TOKEN_COOKIE];
  return cookieValue ?? body?.refreshToken;
}

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;

  const result = await authService.login(email, password, {
    ipAddress: clientIp(req),
    userAgent: req.header('user-agent'),
  });

  res.cookie(REFRESH_TOKEN_COOKIE, result.tokens.refreshToken, refreshCookieOptions());

  sendSuccess(res, result);
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const token = readRefreshToken(req, req.body as RefreshInput);

  if (!token) {
    throw new UnauthorizedError('A refresh token is required.');
  }

  const tokens = await authService.refresh(token, {
    ipAddress: clientIp(req),
    userAgent: req.header('user-agent'),
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshCookieOptions());

  sendSuccess(res, tokens);
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = requirePrincipal(req);

  await authService.logout(readRefreshToken(req), user);

  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  sendNoContent(res);
});

export const logoutEverywhereHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = requirePrincipal(req);
  const revokedCount = await authService.logoutEverywhere(user);

  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  sendSuccess(res, { revokedCount });
});

/** The client bootstraps its permission-aware UI from this. */
export const currentUserHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, requirePrincipal(req));
});

export const listSessionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const sessions = await authService.listSessions(requirePrincipal(req));
  sendSuccess(res, sessions);
});

export const revokeSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = requirePrincipal(req);
  await authService.revokeOwnSession(user, req.params.sessionId as string);
  sendNoContent(res);
});
