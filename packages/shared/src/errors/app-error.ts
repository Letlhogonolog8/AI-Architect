import { ErrorCode } from './error-codes';

export type ErrorDetails = Record<string, string[]>;

/**
 * The only error type the API is allowed to throw deliberately.
 *
 * `isOperational` separates expected failures (bad input, missing row, denied
 * permission) from programmer errors. The error handler renders operational
 * errors verbatim and collapses everything else into a generic 500, so an
 * unexpected stack trace can never reach a client.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetails; cause?: unknown; isOperational?: boolean } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'The request could not be understood.', details?: ErrorDetails) {
    super(400, ErrorCode.BAD_REQUEST, message, { details });
  }
}

export class ValidationError extends AppError {
  constructor(details: ErrorDetails, message = 'One or more fields failed validation.') {
    super(400, ErrorCode.VALIDATION_FAILED, message, { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.', code: ErrorCode = ErrorCode.AUTH_REQUIRED) {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have access to this resource.',
    code: ErrorCode = ErrorCode.FORBIDDEN,
  ) {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', identifier?: string) {
    super(
      404,
      ErrorCode.NOT_FOUND,
      identifier ? `${resource} '${identifier}' was not found.` : `${resource} was not found.`,
    );
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'The resource is in a conflicting state.',
    code: ErrorCode = ErrorCode.CONFLICT,
  ) {
    super(409, code, message);
  }
}

export class RateLimitError extends AppError {
  /** Seconds the caller should wait before retrying. Rendered as `Retry-After`. */
  readonly retryAfterSeconds: number;

  constructor(
    retryAfterSeconds: number,
    message = 'Too many requests.',
    code: ErrorCode = ErrorCode.RATE_LIMITED,
  ) {
    super(429, code, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred.', cause?: unknown) {
    super(500, ErrorCode.INTERNAL_ERROR, message, { cause, isOperational: false });
  }
}

/**
 * A capability this build does not have.
 *
 * 501 rather than 500 or 503: the caller asked for something the deployment
 * cannot do, which is a fact about what is installed rather than a fault or a
 * transient outage. Retrying will not help, and the message says what is
 * missing.
 *
 * This is the API-side counterpart of the AI gateway returning 501 for an
 * absent model. Both exist so an unbuilt capability fails loudly instead of
 * returning a plausible-looking answer nobody computed.
 */
export class NotImplementedError extends AppError {
  constructor(message: string) {
    super(501, ErrorCode.NOT_IMPLEMENTED, message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, cause?: unknown) {
    super(503, ErrorCode.UPSTREAM_UNAVAILABLE, `${service} is currently unavailable.`, { cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
