/**
 * Deterministic serialisation for anything that will be hashed or signed.
 *
 * Two systems computing a digest over "the same" JSON must feed the hash the
 * exact same bytes, and `JSON.stringify` does not guarantee that: key order
 * follows insertion order, and a manifest rebuilt in a different order would
 * hash differently and fail verification for no real reason. `canonicalize`
 * removes that variable — object keys are sorted, `undefined` members are
 * dropped, and there is no incidental whitespace — so the digest depends only on
 * the data, which is the whole point of a digest.
 *
 * Pure and dependency-free on purpose: it runs identically in the API (Node),
 * the evidence worker, and the browser, and the actual hashing is done by
 * whoever holds a hash function, so this module never imports `node:crypto` and
 * never breaks the web build.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item ?? null)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonicalize(v)}`);
    return `{${entries.join(',')}}`;
  }

  // Strings, finite numbers and booleans serialise unambiguously.
  return JSON.stringify(value);
}
