import { PlaceholderPage } from '@/components/common/PlaceholderPage';

/**
 * Evidence vault.
 *
 * The API side is complete — registration, checksum-verified sealing, custody
 * chain and audited export all exist. What is missing is the direct-to-object-
 * storage upload flow, which needs a storage provider chosen and signed-URL
 * issuance implemented; see `docs/architecture/evidence-chain-of-custody.md`.
 */
export function EvidencePage() {
  return (
    <PlaceholderPage
      eyebrow="Intelligence"
      title="Evidence vault"
      description="Tamper-evident custody of video, audio, telemetry snapshots and AI inferences attached to incidents."
      capabilities={[
        {
          title: 'Artefact register',
          description:
            'Every artefact with its type, size, capture time, seal state and SHA-256 digest.',
          endpoint: 'GET /api/v1/evidence',
        },
        {
          title: 'Checksum-verified sealing',
          description:
            'The digest recomputed after upload must match the one declared at registration, or the artefact is flagged corrupted rather than sealed.',
          endpoint: 'POST /api/v1/evidence/:evidenceId/seal',
        },
        {
          title: 'Chain of custody',
          description:
            'Append-only log of every access, export and verification, with actor, IP and timestamp.',
          endpoint: 'GET /api/v1/evidence/:evidenceId/custody',
        },
        {
          title: 'Audited disclosure',
          description:
            'Export requires a recipient and a written reason, both recorded permanently against the artefact.',
          endpoint: 'POST /api/v1/evidence/:evidenceId/export',
        },
      ]}
    />
  );
}
