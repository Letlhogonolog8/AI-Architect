/**
 * Route paths, in one place.
 *
 * Every `<Link>`, redirect and navigation call reads from here, so a path
 * change is a single edit rather than a grep-and-hope.
 */
export const routes = {
  login: '/login',

  dashboard: '/dashboard',
  fleet: '/fleet',

  vehicles: '/vehicles',
  vehicleDetail: (vehicleId = ':vehicleId') => `/vehicles/${vehicleId}`,

  drivers: '/drivers',
  driverDetail: (driverId = ':driverId') => `/drivers/${driverId}`,

  incidents: '/incidents',
  incidentDetail: (incidentId = ':incidentId') => `/incidents/${incidentId}`,

  evidence: '/evidence',
  threatIntelligence: '/threat-intelligence',
  analytics: '/analytics',

  settings: '/settings',
  users: '/users',
  roles: '/roles',
  auditLogs: '/audit-logs',

  forbidden: '/forbidden',
} as const;
