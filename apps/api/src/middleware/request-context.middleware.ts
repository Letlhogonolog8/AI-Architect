import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { REQUEST_ID_HEADER } from '@aegisdrive/shared';
import { clientIp } from '../core/http';
import { runWithContext } from '../core/request-context';

/**
 * Establishes the per-request async context and correlation id.
 *
 * Must be mounted first: everything downstream — logging, audit, error
 * envelopes — reads the request id from this store.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const inbound = req.header(REQUEST_ID_HEADER);
  // Trust an upstream id only if it looks like one; a caller-controlled string
  // ends up in logs and must not be able to inject newlines or unbounded text.
  const requestId = inbound && /^[\w-]{8,64}$/.test(inbound) ? inbound : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithContext(
    {
      requestId,
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent'),
    },
    () => next(),
  );
};
