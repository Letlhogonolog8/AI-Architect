import type { WidgetDefinition } from '@/components/widgets/WidgetGrid';
import { WIDGET_REGISTRY, type WidgetId } from '@/components/widgets/registry';

/**
 * Command-centre layout.
 *
 * Data, not markup. Reordering the board, giving a role a different default, or
 * persisting an operator's own arrangement are all edits to this array — no
 * component changes.
 *
 * Reading order is deliberate and follows how a control room is actually
 * scanned on arrival:
 *
 *   1. **Numbers** — KPIs and posture. Is anything wrong right now?
 *   2. **Geography** — the map. Where is it?
 *   3. **Decisions** — the AI console. What does the platform want me to do?
 *   4. **Detail** — vehicles, corridors, cameras. Working surfaces.
 *   5. **Resources** — police, hospitals, security. Who can I send?
 *   6. **Aftermath** — evidence and dispatch. What do I preserve and who do I tell?
 */

interface LayoutEntry {
  widget: WidgetId;
  span: { base: number; md: number; xl: number };
  rowSpan?: number;
}

const LAYOUT: readonly LayoutEntry[] = [
  // Row 1 — the glance layer.
  { widget: 'liveKpis', span: { base: 12, md: 12, xl: 8 }, rowSpan: 1 },
  { widget: 'threatGauges', span: { base: 12, md: 12, xl: 4 }, rowSpan: 1 },

  // Row 2 — the map is the largest single element on the board, flanked by the
  // decision console. An operator should be able to see where a threat is and
  // what to do about it without moving their eyes off one region.
  { widget: 'tacticalMap', span: { base: 12, md: 12, xl: 8 }, rowSpan: 3 },
  { widget: 'aiDecisionConsole', span: { base: 12, md: 6, xl: 4 }, rowSpan: 3 },

  // Row 3 — working surfaces.
  { widget: 'liveVehicles', span: { base: 12, md: 6, xl: 4 }, rowSpan: 2 },
  { widget: 'cameraGrid', span: { base: 12, md: 6, xl: 5 }, rowSpan: 2 },
  { widget: 'aiIncidentSummary', span: { base: 12, md: 12, xl: 3 }, rowSpan: 2 },

  // Identity sits beside the working surfaces rather than with the response
  // resources: 'is the right person driving' is a triage question, and an
  // operator asks it while looking at the vehicle list, not afterwards.
  { widget: 'driverConfidence', span: { base: 12, md: 6, xl: 4 }, rowSpan: 2 },

  // Row 4 — intelligence and routing.
  { widget: 'safeCorridors', span: { base: 12, md: 6, xl: 4 }, rowSpan: 2 },
  { widget: 'crimeHotspots', span: { base: 12, md: 6, xl: 4 }, rowSpan: 2 },
  { widget: 'notificationDispatch', span: { base: 12, md: 12, xl: 4 }, rowSpan: 2 },

  // Row 5 — response resources.
  { widget: 'police', span: { base: 12, md: 6, xl: 3 }, rowSpan: 2 },
  { widget: 'hospitals', span: { base: 12, md: 6, xl: 3 }, rowSpan: 2 },
  { widget: 'securityCompanies', span: { base: 12, md: 6, xl: 3 }, rowSpan: 2 },
  { widget: 'evidenceVault', span: { base: 12, md: 6, xl: 3 }, rowSpan: 2 },
];

/** Resolves the layout against the registry into what the grid renders. */
export const COMMAND_CENTRE_LAYOUT: readonly WidgetDefinition[] = LAYOUT.map((entry) => {
  const meta = WIDGET_REGISTRY[entry.widget];

  return {
    id: meta.id,
    component: meta.component,
    permissions: meta.permissions,
    span: entry.span,
    rowSpan: entry.rowSpan,
  };
});
