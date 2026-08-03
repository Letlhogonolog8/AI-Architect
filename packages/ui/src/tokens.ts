import {
  IncidentSeverity,
  IncidentStatus,
  ThreatLevel,
  VehicleStatus,
  type DriverStatus,
} from '@aegisdrive/types';

/**
 * Domain → visual token maps.
 *
 * Every class name here is a complete literal string. Tailwind's scanner cannot
 * see interpolated names, so `bg-severity-${severity}` would silently produce
 * unstyled markup in a production build. Exhaustive `Record`s also mean adding
 * an enum member is a compile error until it has been given a colour.
 */

export interface VisualToken {
  label: string;
  /** Foreground text colour. */
  text: string;
  /** Translucent fill for pills and chips. */
  surface: string;
  /** Hairline border matching the fill. */
  border: string;
  /** Solid colour for status dots and chart marks. */
  dot: string;
}

export const SEVERITY_TOKENS: Record<IncidentSeverity, VisualToken> = {
  [IncidentSeverity.INFO]: {
    label: 'Info',
    text: 'text-severity-info',
    surface: 'bg-severity-info/10',
    border: 'border-severity-info/25',
    dot: 'bg-severity-info',
  },
  [IncidentSeverity.LOW]: {
    label: 'Low',
    text: 'text-severity-low',
    surface: 'bg-severity-low/10',
    border: 'border-severity-low/25',
    dot: 'bg-severity-low',
  },
  [IncidentSeverity.MEDIUM]: {
    label: 'Medium',
    text: 'text-severity-medium',
    surface: 'bg-severity-medium/10',
    border: 'border-severity-medium/25',
    dot: 'bg-severity-medium',
  },
  [IncidentSeverity.HIGH]: {
    label: 'High',
    text: 'text-severity-high',
    surface: 'bg-severity-high/12',
    border: 'border-severity-high/30',
    dot: 'bg-severity-high',
  },
  [IncidentSeverity.CRITICAL]: {
    label: 'Critical',
    text: 'text-severity-critical',
    surface: 'bg-severity-critical/15',
    border: 'border-severity-critical/35',
    dot: 'bg-severity-critical',
  },
};

export const THREAT_TOKENS: Record<ThreatLevel, VisualToken> = {
  [ThreatLevel.MINIMAL]: {
    label: 'Minimal',
    text: 'text-threat-minimal',
    surface: 'bg-threat-minimal/10',
    border: 'border-threat-minimal/25',
    dot: 'bg-threat-minimal',
  },
  [ThreatLevel.GUARDED]: {
    label: 'Guarded',
    text: 'text-threat-guarded',
    surface: 'bg-threat-guarded/10',
    border: 'border-threat-guarded/25',
    dot: 'bg-threat-guarded',
  },
  [ThreatLevel.ELEVATED]: {
    label: 'Elevated',
    text: 'text-threat-elevated',
    surface: 'bg-threat-elevated/10',
    border: 'border-threat-elevated/25',
    dot: 'bg-threat-elevated',
  },
  [ThreatLevel.HIGH]: {
    label: 'High',
    text: 'text-threat-high',
    surface: 'bg-threat-high/12',
    border: 'border-threat-high/30',
    dot: 'bg-threat-high',
  },
  [ThreatLevel.SEVERE]: {
    label: 'Severe',
    text: 'text-threat-severe',
    surface: 'bg-threat-severe/15',
    border: 'border-threat-severe/35',
    dot: 'bg-threat-severe',
  },
};

export const VEHICLE_STATUS_TOKENS: Record<VehicleStatus, VisualToken> = {
  [VehicleStatus.ACTIVE]: {
    label: 'Active',
    text: 'text-signal-success',
    surface: 'bg-signal-success/10',
    border: 'border-signal-success/25',
    dot: 'bg-signal-success',
  },
  [VehicleStatus.IDLE]: {
    label: 'Idle',
    text: 'text-ink-secondary',
    surface: 'bg-white/5',
    border: 'border-hairline',
    dot: 'bg-ink-tertiary',
  },
  [VehicleStatus.IN_TRANSIT]: {
    label: 'In transit',
    text: 'text-aegis-300',
    surface: 'bg-aegis-500/10',
    border: 'border-aegis-500/25',
    dot: 'bg-aegis-400',
  },
  [VehicleStatus.UNDER_THREAT]: {
    label: 'Under threat',
    text: 'text-signal-critical',
    surface: 'bg-signal-critical/15',
    border: 'border-signal-critical/35',
    dot: 'bg-signal-critical',
  },
  [VehicleStatus.IMMOBILISED]: {
    label: 'Immobilised',
    text: 'text-signal-warning',
    surface: 'bg-signal-warning/10',
    border: 'border-signal-warning/25',
    dot: 'bg-signal-warning',
  },
  [VehicleStatus.STOLEN]: {
    label: 'Stolen',
    text: 'text-signal-critical',
    surface: 'bg-signal-critical/15',
    border: 'border-signal-critical/35',
    dot: 'bg-signal-critical',
  },
  [VehicleStatus.RECOVERED]: {
    label: 'Recovered',
    text: 'text-signal-success',
    surface: 'bg-signal-success/10',
    border: 'border-signal-success/25',
    dot: 'bg-signal-success',
  },
  [VehicleStatus.MAINTENANCE]: {
    label: 'Maintenance',
    text: 'text-signal-warning',
    surface: 'bg-signal-warning/10',
    border: 'border-signal-warning/25',
    dot: 'bg-signal-warning',
  },
  [VehicleStatus.DECOMMISSIONED]: {
    label: 'Decommissioned',
    text: 'text-ink-tertiary',
    surface: 'bg-white/5',
    border: 'border-hairline',
    dot: 'bg-ink-tertiary',
  },
};

export const INCIDENT_STATUS_TOKENS: Record<IncidentStatus, VisualToken> = {
  [IncidentStatus.DETECTED]: {
    label: 'Detected',
    text: 'text-signal-critical',
    surface: 'bg-signal-critical/12',
    border: 'border-signal-critical/30',
    dot: 'bg-signal-critical',
  },
  [IncidentStatus.TRIAGED]: {
    label: 'Triaged',
    text: 'text-signal-warning',
    surface: 'bg-signal-warning/10',
    border: 'border-signal-warning/25',
    dot: 'bg-signal-warning',
  },
  [IncidentStatus.ESCALATED]: {
    label: 'Escalated',
    text: 'text-severity-high',
    surface: 'bg-severity-high/12',
    border: 'border-severity-high/30',
    dot: 'bg-severity-high',
  },
  [IncidentStatus.RESPONDING]: {
    label: 'Responding',
    text: 'text-aegis-300',
    surface: 'bg-aegis-500/10',
    border: 'border-aegis-500/25',
    dot: 'bg-aegis-400',
  },
  [IncidentStatus.CONTAINED]: {
    label: 'Contained',
    text: 'text-hologram',
    surface: 'bg-hologram/10',
    border: 'border-hologram/25',
    dot: 'bg-hologram',
  },
  [IncidentStatus.RESOLVED]: {
    label: 'Resolved',
    text: 'text-signal-success',
    surface: 'bg-signal-success/10',
    border: 'border-signal-success/25',
    dot: 'bg-signal-success',
  },
  [IncidentStatus.FALSE_POSITIVE]: {
    label: 'False positive',
    text: 'text-ink-secondary',
    surface: 'bg-white/5',
    border: 'border-hairline',
    dot: 'bg-ink-tertiary',
  },
  [IncidentStatus.ARCHIVED]: {
    label: 'Archived',
    text: 'text-ink-tertiary',
    surface: 'bg-white/5',
    border: 'border-hairline',
    dot: 'bg-ink-tertiary',
  },
};

export const DRIVER_STATUS_TOKENS: Record<DriverStatus, VisualToken> = {
  ON_DUTY: {
    label: 'On duty',
    text: 'text-signal-success',
    surface: 'bg-signal-success/10',
    border: 'border-signal-success/25',
    dot: 'bg-signal-success',
  },
  OFF_DUTY: {
    label: 'Off duty',
    text: 'text-ink-tertiary',
    surface: 'bg-white/5',
    border: 'border-hairline',
    dot: 'bg-ink-tertiary',
  },
  DRIVING: {
    label: 'Driving',
    text: 'text-aegis-300',
    surface: 'bg-aegis-500/10',
    border: 'border-aegis-500/25',
    dot: 'bg-aegis-400',
  },
  RESTING: {
    label: 'Resting',
    text: 'text-ink-secondary',
    surface: 'bg-white/5',
    border: 'border-hairline',
    dot: 'bg-ink-secondary',
  },
  DISTRESS: {
    label: 'Distress',
    text: 'text-signal-critical',
    surface: 'bg-signal-critical/15',
    border: 'border-signal-critical/35',
    dot: 'bg-signal-critical',
  },
  UNREACHABLE: {
    label: 'Unreachable',
    text: 'text-signal-warning',
    surface: 'bg-signal-warning/10',
    border: 'border-signal-warning/25',
    dot: 'bg-signal-warning',
  },
};
