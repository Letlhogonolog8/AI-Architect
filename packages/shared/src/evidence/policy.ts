/**
 * Evidence Vault constants.
 */

/** The hash the vault anchors everything on. Named in every manifest and seal. */
export const DIGEST_ALGORITHM = 'SHA-256';

/** Bumped only when the manifest shape changes; old digests stay reproducible. */
export const MANIFEST_VERSION = 'evidence-manifest-v1';

/** The court-bundle format tag a recipient checks before trusting a package. */
export const COURT_BUNDLE_FORMAT = 'aegisdrive-court-bundle-v1';

/** Per-tenant, per-year export reference prefix, e.g. `EXP-2026-000017`. */
export const EXPORT_REFERENCE_PREFIX = 'EXP';

/** Evidence states from which an artefact may be exported or included in a bundle. */
export const DISCLOSABLE_EVIDENCE_STATUSES = ['SEALED', 'VERIFIED'] as const;

/** A soft ceiling on how many artefacts one court bundle may carry. */
export const MAX_EXPORT_BUNDLE_ITEMS = 500;
