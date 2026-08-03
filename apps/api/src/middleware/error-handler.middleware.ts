import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import {
  AppError,
  ErrorCode,
  NotFoundError,
  RateLimitError,
  isAppError,
  zodErrorToDetails,
} from '@aegisdrive/shared';
import { isProduction } from '../config/env';
import { logger } from '../core/logger';
import { sendFailure } from '../core/http';
import { getContext } from '../core/request-context';

/** Terminal 404 for unmatched routes. Mounted after every router. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError('Endpoint', `${req.method} ${req.path}`));
};

/**
 * Translates a Prisma failure into the operational error it actually
 * represents. Without this, a duplicate registration number surfaces as a 500.
 */
function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError | null {
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'field');
      return new AppError(
        409,
        ErrorCode.DUPLICATE_RESOURCE,
        `A record with this ${fields} already exists.`,
      );
    }
    case 'P2025':
      return new AppError(404, ErrorCode.NOT_FOUND, 'The requested record does not exist.');
    case 'P2003':
      return new AppError(
        409,
        ErrorCode.CONFLICT,
        'A related record is missing or still referenced.',
      );
    case 'P2024':
      return new AppError(
        503,
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'The database connection pool is exhausted.',
      );
    default:
      return null;
  }
}

function normalise(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new AppError(400, ErrorCode.VALIDATION_FAILED, 'One or more fields failed validation.', {
      details: zodErrorToDetails(error),
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaError(error);
    if (mapped) return mapped;
    return new AppError(500, ErrorCode.DATABASE_ERROR, 'A database error occurred.', {
      cause: error,
      isOperational: false,
    });
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(
      500,
      ErrorCode.DATABASE_ERROR,
      'An invalid database query was constructed.',
      {
        cause: error,
        isOperational: false,
      },
    );
  }

  return new AppError(500, ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred.', {
    cause: error,
    isOperational: false,
  });
}

/**
 * The single exit point for every failure.
 *
 * Non-operational errors are logged in full and rendered as a bare 500: an
 * unexpected stack trace, a Prisma query or a connection string must never
 * cross the wire.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalise(error);
  const context = getContext();

  const logPayload = {
    err: error,
    requestId: context?.requestId,
    userId: context?.user?.id,
    organizationId: context?.user?.organizationId,
    method: req.method,
    path: req.originalUrl,
    statusCode: appError.statusCode,
    code: appError.code,
  };

  if (appError.isOperational) {
    logger.warn(logPayload, appError.message);
  } else {
    logger.error(logPayload, 'Unhandled error');
  }

  if (appError instanceof RateLimitError) {
    res.setHeader('Retry-After', String(appError.retryAfterSeconds));
  }

  const exposeDetail = appError.isOperational || !isProduction;

  sendFailure(res, appError.statusCode, {
    code: appError.code,
    message: exposeDetail ? appError.message : 'An unexpected error occurred.',
    details: exposeDetail ? appError.details : undefined,
  });
};
