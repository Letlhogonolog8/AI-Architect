import { createHash } from 'node:crypto';
import type { DigestSignature } from '@aegisdrive/shared';
import { registeredSigner } from '@aegisdrive/shared';

/**
 * The API's hashing and signing primitives for the Evidence Vault.
 *
 * The actual SHA-256 lives here rather than in `@aegisdrive/shared` because
 * shared is isomorphic and must not import `node:crypto` — it would break the
 * web build. Shared owns the *shape* of what is hashed (canonical manifests,
 * custody payloads); this owns the hash function and passes it back in.
 */

/** Lowercase hex SHA-256 of a UTF-8 string. The vault's one hash. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Signs a manifest digest with the registered signer, or returns `null` when no
 * signer is installed.
 *
 * `null` is the honest default of this build — the caller records `UNSIGNED`
 * rather than fabricating a signature. A signer that throws is treated the same
 * way and logged by the caller: an unsigned artefact is a state, not a failure
 * that should abort a seal.
 */
export async function signDigest(digestHex: string): Promise<DigestSignature | null> {
  const signer = registeredSigner();
  if (signer === null) return null;
  return signer.sign(digestHex);
}

export function activeSignerInfo(): {
  providerId: string;
  algorithm: string;
  keyId: string;
} | null {
  const signer = registeredSigner();
  if (signer === null) return null;
  return { providerId: signer.providerId, algorithm: signer.algorithm, keyId: signer.keyId };
}
