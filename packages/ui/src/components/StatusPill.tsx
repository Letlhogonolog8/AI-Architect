import type { HTMLAttributes } from 'react';
import type {
  DriverStatus,
  IncidentSeverity,
  IncidentStatus,
  ThreatLevel,
  VehicleStatus,
} from '@aegisdrive/types';
import { cn } from '../lib/cn';
import {
  DRIVER_STATUS_TOKENS,
  INCIDENT_STATUS_TOKENS,
  SEVERITY_TOKENS,
  THREAT_TOKENS,
  VEHICLE_STATUS_TOKENS,
  type VisualToken,
} from '../tokens';

/**
 * Discriminated pair of "which enum" and "which member". Nesting it under a
 * single `status` prop keeps the union narrowable after destructuring, which a
 * flat `kind`/`value` pair on the props object would not.
 */
export type StatusDescriptor =
  | { kind: 'severity'; value: IncidentSeverity }
  | { kind: 'threat'; value: ThreatLevel }
  | { kind: 'vehicle'; value: VehicleStatus }
  | { kind: 'incident'; value: IncidentStatus }
  | { kind: 'driver'; value: DriverStatus };

export interface StatusPillProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: StatusDescriptor;
  /** Overrides the label from the token map, e.g. to append a count. */
  label?: string;
  /** Pulses the dot. Use only while the condition is genuinely live. */
  pulse?: boolean;
  size?: 'sm' | 'md';
}

function resolveToken(status: StatusDescriptor): VisualToken {
  switch (status.kind) {
    case 'severity':
      return SEVERITY_TOKENS[status.value];
    case 'threat':
      return THREAT_TOKENS[status.value];
    case 'vehicle':
      return VEHICLE_STATUS_TOKENS[status.value];
    case 'incident':
      return INCIDENT_STATUS_TOKENS[status.value];
    case 'driver':
      return DRIVER_STATUS_TOKENS[status.value];
  }
}

/**
 * A status chip whose colour is derived from the domain value rather than
 * chosen at the call site. This is what keeps "CRITICAL" the same red on the
 * dashboard, in the incident table and in the mobile push preview.
 */
export function StatusPill({
  status,
  className,
  label,
  pulse = false,
  size = 'md',
  ...props
}: StatusPillProps) {
  const token = resolveToken(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        token.surface,
        token.border,
        token.text,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', token.dot, pulse && 'animate-pulse-ring')}
      />
      {label ?? token.label}
    </span>
  );
}
