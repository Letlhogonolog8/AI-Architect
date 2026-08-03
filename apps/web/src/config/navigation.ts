import {
  Activity,
  BarChart3,
  Car,
  FileSearch,
  Gauge,
  KeyRound,
  Radar,
  ScrollText,
  Settings,
  ShieldAlert,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@aegisdrive/types';
import { routes } from './routes';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /**
   * The permission that makes this destination useful. Items the principal
   * cannot use are hidden — a sidebar full of links that 403 is worse than a
   * short one. The route guard enforces the same permission, so hiding is
   * presentation and the guard is the control.
   */
  permission: Permission;
  /** Renders a live count badge fed from the realtime store. */
  badge?: 'openIncidents' | 'openAlerts';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: 'Operations',
    items: [
      { label: 'Dashboard', to: routes.dashboard, icon: Gauge, permission: 'dashboard:read' },
      { label: 'Fleet', to: routes.fleet, icon: Truck, permission: 'fleet:read' },
      { label: 'Vehicles', to: routes.vehicles, icon: Car, permission: 'vehicle:read' },
      { label: 'Drivers', to: routes.drivers, icon: Users, permission: 'driver:read' },
      {
        label: 'Incidents',
        to: routes.incidents,
        icon: ShieldAlert,
        permission: 'incident:read',
        badge: 'openIncidents',
      },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      {
        label: 'Threat Intelligence',
        to: routes.threatIntelligence,
        icon: Radar,
        permission: 'threat:read',
      },
      {
        label: 'Evidence Vault',
        to: routes.evidence,
        icon: FileSearch,
        permission: 'evidence:read',
      },
      { label: 'Analytics', to: routes.analytics, icon: BarChart3, permission: 'analytics:read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users', to: routes.users, icon: Users, permission: 'user:read' },
      { label: 'Roles', to: routes.roles, icon: KeyRound, permission: 'role:read' },
      { label: 'Audit Logs', to: routes.auditLogs, icon: ScrollText, permission: 'audit:read' },
      { label: 'Settings', to: routes.settings, icon: Settings, permission: 'settings:read' },
    ],
  },
];

/** Icon used for the live-activity indicator in the top bar. */
export const ActivityIcon = Activity;
