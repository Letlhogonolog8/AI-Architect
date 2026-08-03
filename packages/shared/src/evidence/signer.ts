/**
 * The evidence-signer provider contract.
 *
 * ## Why nothing is signed in this build
 *
 * A digital signature is only worth the custody of the private key that made it.
 * A real one needs that key held in an HSM or a KMS, with an audited access
 * policy and a certificate a court can trace to an identity — none of which a
 * repository ships. Generating an ephemeral keypair in-process and signing with
 * it would produce a cryptographically valid signature that proves nothing,
 * because nobody can say whose key it was or that it was not also used to sign a
 * forgery. That is worse than no signature: it is a signature that looks like
 * assurance and is not.
 *
 * So no signer is installed, and a seal or bundle is recorded `UNSIGNED`. The
 * SHA-256 manifest digest is still real and always computed — the artefact's
 * integrity is anchored — and when a certified signer is registered the same
 * digest is signed and the status becomes `SIGNED`. This is the identity
 * engine's KMS discipline applied to signatures: the key lives behind the
 * interface, never in this process by default.
 */

export const SIGNER_CONTRACT_VERSION = 'evidence-signer-v1' as const;

export class EvidenceSignerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceSignerUnavailableError';
  }
}

export interface DigestSignature {
  /** Base64 signature over the digest. */
  signature: string;
  algorithm: string;
  keyId: string;
}

/**
 * A signer over a hex digest.
 *
 * Deliberately narrow: it signs a digest the vault already computed and returns
 * the signature and the key that made it. It does not build manifests, choose
 * what to sign, or hold plaintext material this process can read — the key stays
 * inside the HSM or KMS the provider fronts.
 */
export interface EvidenceSigner {
  readonly providerId: string;
  readonly algorithm: string;
  readonly keyId: string;
  isAvailable(): Promise<boolean>;
  /** Signs the hex-encoded digest. */
  sign(digestHex: string): Promise<DigestSignature>;
}

let installed: EvidenceSigner | null = null;

export function registerEvidenceSigner(signer: EvidenceSigner): void {
  installed = signer;
}

export function registeredSigner(): EvidenceSigner | null {
  return installed;
}

/**
 * The installed signer, or throws with a message that says what is missing. The
 * vault catches this and records `UNSIGNED` rather than failing the seal — an
 * unsigned-but-hashed artefact is a state, not an error.
 */
export function requireSigner(): EvidenceSigner {
  if (installed === null) {
    throw new EvidenceSignerUnavailableError(
      'No evidence signer is installed, so the manifest digest is recorded but not signed. ' +
        'The digest, the tamper-evident custody chain and the sealed state are all real; what ' +
        'is missing is an HSM- or KMS-backed key whose custody a court can trust. Register one ' +
        'with registerEvidenceSigner() — see ADR-0014.',
    );
  }
  return installed;
}

export function resetEvidenceSigner(): void {
  installed = null;
}
