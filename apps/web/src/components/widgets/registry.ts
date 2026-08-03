import type { ComponentType } from 'react';
import type { Permission } from '@aegisdrive/types';
import { TacticalMapWidget } from './map/TacticalMapWidget';
import { LiveKpiWidget } from './LiveKpiWidget';
import { ThreatGaugesWidget } from './ThreatGaugesWidget';
import { LiveVehiclesWidget } from './LiveVehiclesWidget';
import { SafeCorridorWidget } from './SafeCorridorWidget';
import { CrimeHotspotsWidget } from './CrimeHotspotsWidget';
import { HospitalsWidget, PoliceWidget, SecurityCompaniesWidget } from './ResponderAssetsWidget';
import { AIIncidentSummaryWidget } from './AIIncidentSummaryWidget';
import { LiveCameraGridWidget } from './LiveCameraGridWidget';
import { AIDecisionConsoleWidget } from './AIDecisionConsoleWidget';
import { NotificationDispatchWidget } from './NotificationDispatchWidget';
import { EvidenceVaultWidget } from './EvidenceVaultWidget';
import { DriverConfidenceWidget } from './DriverConfidenceWidget';

/**
 * The widget catalogue.
 *
 * Every panel the command centre can render, keyed by id, with the permission
 * it needs. A layout is then just a list of ids — which is what makes
 * per-role dashboards, operator-saved layouts and drag-to-rearrange changes to
 * data rather than to markup.
 *
 * Adding a widget means adding one entry here and one id to a layout. Nothing
 * else in the app changes.
 */
export interface WidgetMeta {
  id: string;
  /** Shown in the layout editor and the "hidden by permission" explainer. */
  name: string;
  component: ComponentType;
  /** The principal needs at least one of these to see the widget at all. */
  permissions: readonly Permission[];
}

export const WIDGET_REGISTRY = {
  tacticalMap: {
    id: 'tacticalMap',
    name: 'Tactical map',
    component: TacticalMapWidget,
    permissions: ['fleet:read', 'vehicle:read'],
  },
  liveKpis: {
    id: 'liveKpis',
    name: 'Live KPIs',
    component: LiveKpiWidget,
    permissions: ['dashboard:read'],
  },
  threatGauges: {
    id: 'threatGauges',
    name: 'Threat posture',
    component: ThreatGaugesWidget,
    permissions: ['dashboard:read'],
  },
  liveVehicles: {
    id: 'liveVehicles',
    name: 'Live vehicles',
    component: LiveVehiclesWidget,
    permissions: ['vehicle:read'],
  },
  safeCorridors: {
    id: 'safeCorridors',
    name: 'SafeCorridor routes',
    component: SafeCorridorWidget,
    permissions: ['fleet:read'],
  },
  crimeHotspots: {
    id: 'crimeHotspots',
    name: 'Crime hotspots',
    component: CrimeHotspotsWidget,
    permissions: ['threat:read'],
  },
  police: {
    id: 'police',
    name: 'Police',
    component: PoliceWidget,
    permissions: ['incident:read'],
  },
  hospitals: {
    id: 'hospitals',
    name: 'Hospitals',
    component: HospitalsWidget,
    permissions: ['incident:read'],
  },
  securityCompanies: {
    id: 'securityCompanies',
    name: 'Security companies',
    component: SecurityCompaniesWidget,
    permissions: ['incident:read'],
  },
  aiIncidentSummary: {
    id: 'aiIncidentSummary',
    name: 'AI incident summary',
    component: AIIncidentSummaryWidget,
    permissions: ['incident:read'],
  },
  cameraGrid: {
    id: 'cameraGrid',
    name: 'Live camera grid',
    component: LiveCameraGridWidget,
    permissions: ['evidence:read', 'vehicle:read'],
  },
  aiDecisionConsole: {
    id: 'aiDecisionConsole',
    name: 'AI decision console',
    component: AIDecisionConsoleWidget,
    permissions: ['threat:read'],
  },
  notificationDispatch: {
    id: 'notificationDispatch',
    name: 'Notification dispatch',
    component: NotificationDispatchWidget,
    permissions: ['notification:read'],
  },
  driverConfidence: {
    id: 'driverConfidence',
    name: 'Driver identity',
    component: DriverConfidenceWidget,
    permissions: ['identity:read'],
  },
  evidenceVault: {
    id: 'evidenceVault',
    name: 'Evidence vault',
    component: EvidenceVaultWidget,
    permissions: ['evidence:read'],
  },
} as const satisfies Record<string, WidgetMeta>;

export type WidgetId = keyof typeof WIDGET_REGISTRY;

export function getWidget(id: WidgetId): WidgetMeta {
  return WIDGET_REGISTRY[id];
}
