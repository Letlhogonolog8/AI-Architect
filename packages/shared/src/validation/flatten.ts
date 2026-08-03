import type { ZodError } from 'zod';
import type { ErrorDetails } from '../errors';

/**
 * Collapses a `ZodError` into the flat `{ 'field.path': [messages] }` shape the
 * API renders in `error.details` and the web forms feed back into inputs.
 *
 * Zod's own `flatten()` only handles one level, which loses the path for nested
 * objects and arrays — hence the manual join.
 */
export function zodErrorToDetails(error: ZodError): ErrorDetails {
  const details: ErrorDetails = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    const bucket = details[path];
    if (bucket) {
      bucket.push(issue.message);
    } else {
      details[path] = [issue.message];
    }
  }

  return details;
}
