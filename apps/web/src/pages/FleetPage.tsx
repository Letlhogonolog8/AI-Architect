import { Panel } from '@aegisdrive/ui';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { TacticalMapPlaceholder } from '@/components/domain/TacticalMapPlaceholder';
import { useCommandCentreStore } from '@/stores/command-centre.store';

/**
 * Fleet command view.
 *
 * Distinct from `/vehicles`: that screen is a register, this one is a live
 * geographic picture. It becomes the primary operator surface once Mapbox is
 * integrated.
 */
export function FleetPage() {
  const trackedVehicles = useCommandCentreStore((state) => Object.keys(state.positions).length);

  return (
    <PlaceholderPage
      eyebrow="Operations"
      title="Fleet command"
      description="Live geographic view of every protected vehicle, overlaid with threat zones and responder positions."
      capabilities={[
        {
          title: 'Live vehicle layer',
          description:
            'Positions stream over the realtime channel and are already buffered client-side, keyed by vehicle.',
          endpoint: 'ws /realtime → vehicle:position',
        },
        {
          title: 'Threat zone overlay',
          description:
            'Curated hotspots with radius, level and time-of-day windows, ready to render as circles.',
          endpoint: 'GET /api/v1/threat-events/zones',
        },
        {
          title: 'Vehicle drill-down',
          description:
            'Selecting a pin opens the vehicle record with its risk gauge and telemetry history.',
          endpoint: 'GET /api/v1/vehicles/:vehicleId',
        },
        {
          title: 'Route replay',
          description:
            'Scrub back through a vehicle’s recorded path for forensic reconstruction of an incident.',
          endpoint: 'GET /api/v1/telemetry/vehicles/:vehicleId',
        },
      ]}
    >
      <Panel
        title="Tactical map"
        description="Rendering layer pending Mapbox integration."
        className="min-h-[460px]"
      >
        <TacticalMapPlaceholder trackedVehicles={trackedVehicles} />
      </Panel>
    </PlaceholderPage>
  );
}
