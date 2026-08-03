import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ValidationError, zodErrorToDetails } from '@aegisdrive/shared';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and *replaces* the request parts it is given.
 *
 * Replacement is the point: after this middleware, `req.body` holds the parsed
 * output — coerced, defaulted and stripped of unknown keys — so handlers never
 * see raw input. Anything not declared in a schema never reaches a service.
 *
 * Express 5 makes `req.query` a getter, so the parsed query is assigned through
 * `Object.defineProperty` rather than a plain write, which would silently fail.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }

      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      next();
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'issues' in error) {
        next(new ValidationError(zodErrorToDetails(error as z.ZodError)));
        return;
      }
      next(error);
    }
  };
}

/** Narrowed accessor for a body that has already passed `validate`. */
export function validatedBody<T extends ZodTypeAny>(
  req: { body: unknown },
  _schema: T,
): z.infer<T> {
  return req.body as z.infer<T>;
}

/** Narrowed accessor for a query that has already passed `validate`. */
export function validatedQuery<T extends ZodTypeAny>(
  req: { query: unknown },
  _schema: T,
): z.infer<T> {
  return req.query as z.infer<T>;
}
