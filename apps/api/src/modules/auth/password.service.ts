import bcrypt from 'bcryptjs';
import { env } from '../../config/env';

/**
 * Password hashing.
 *
 * bcrypt with a configurable cost. Argon2id is the stronger primitive and is
 * the intended migration target, but it needs a native build; bcryptjs keeps
 * the API image dependency-free while the platform is being stood up. The
 * migration is safe because `verifyPassword` already tolerates rehashing —
 * see `needsRehash`.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.BCRYPT_ROUNDS);
}

/**
 * Constant-time comparison via bcrypt. Always runs the full hash even when the
 * stored digest is absent, so a missing account and a wrong password take the
 * same time and cannot be distinguished by an attacker enumerating emails.
 */
export async function verifyPassword(plaintext: string, digest: string | null): Promise<boolean> {
  if (!digest) {
    await bcrypt.compare(plaintext, DUMMY_DIGEST);
    return false;
  }
  return bcrypt.compare(plaintext, digest);
}

/** True when the stored digest was produced with a weaker cost than current policy. */
export function needsRehash(digest: string): boolean {
  const rounds = bcrypt.getRounds(digest);
  return rounds < env.BCRYPT_ROUNDS;
}

/**
 * A real bcrypt digest of a value nobody holds. Used only to burn the same CPU
 * time on the "user not found" path.
 */
const DUMMY_DIGEST = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.3Nn2ZR9Q1hZ4iZ6y3E1oBvB0KyQ0zqO';
