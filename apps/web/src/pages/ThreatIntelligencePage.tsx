import { PlaceholderPage } from '@/components/common/PlaceholderPage';

/**
 * Threat intelligence.
 *
 * Consumes what the AI services produce. The endpoints exist and are enforced;
 * the models that populate them are the next workstream — see
 * `services/ai/README.md`.
 */
export function ThreatIntelligencePage() {
  return (
    <PlaceholderPage
      eyebrow="Intelligence"
      title="Threat intelligence"
      description="Model-detected threats, curated hotspots and the provenance of every automated decision."
      capabilities={[
        {
          title: 'Detected threat feed',
          description:
            'Tailing, route deviation, unusual stops, jammer and duress detections, each carrying model confidence.',
          endpoint: 'GET /api/v1/threat-events',
        },
        {
          title: 'Model provenance',
          description:
            'Every event records the versioned model that produced it. An automated decision that cannot be traced to a model version is not auditable.',
          endpoint: 'GET /api/v1/threat-events/:threatEventId',
        },
        {
          title: 'Hotspot curation',
          description:
            'Geographic risk zones with radius, level and active-hour windows, tenant-specific or global.',
          endpoint: 'GET /api/v1/threat-events/zones',
        },
        {
          title: 'Analyst acknowledgement',
          description:
            'Reviewed events are acknowledged so the unactioned queue reflects genuine backlog.',
          endpoint: 'POST /api/v1/threat-events/:threatEventId/acknowledge',
        },
      ]}
    />
  );
}
