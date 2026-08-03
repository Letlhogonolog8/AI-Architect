import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { routes } from '@/config/routes';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { RequireAnonymous, RequireAuth, RequirePermission } from '@/features/auth/RouteGuards';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';

/**
 * Route table.
 *
 * The dashboard and the login screen are eagerly imported — they are the two
 * entry points, and code-splitting them only adds a network round trip to the
 * critical path. Everything else is lazy, so a driver on a phone never
 * downloads the audit-log screen.
 *
 * Each protected subtree is wrapped in `RequirePermission` with the same
 * permission its API endpoints demand. The guard controls navigation; the API
 * controls access.
 */

const FleetPage = lazy(() => import('@/pages/FleetPage').then((m) => ({ default: m.FleetPage })));
const VehiclesPage = lazy(() =>
  import('@/pages/VehiclesPage').then((m) => ({ default: m.VehiclesPage })),
);
const VehicleDetailPage = lazy(() =>
  import('@/pages/VehicleDetailPage').then((m) => ({ default: m.VehicleDetailPage })),
);
const DriversPage = lazy(() =>
  import('@/pages/DriversPage').then((m) => ({ default: m.DriversPage })),
);
const IncidentsPage = lazy(() =>
  import('@/pages/IncidentsPage').then((m) => ({ default: m.IncidentsPage })),
);
const IncidentDetailPage = lazy(() =>
  import('@/pages/IncidentDetailPage').then((m) => ({ default: m.IncidentDetailPage })),
);
const EvidencePage = lazy(() =>
  import('@/pages/EvidencePage').then((m) => ({ default: m.EvidencePage })),
);
const ThreatIntelligencePage = lazy(() =>
  import('@/pages/ThreatIntelligencePage').then((m) => ({ default: m.ThreatIntelligencePage })),
);
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('@/pages/RolesPage').then((m) => ({ default: m.RolesPage })));
const AuditLogsPage = lazy(() =>
  import('@/pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })),
);

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingScreen variant="inline" label="Loading screen" />}>
      <Routes>
        <Route element={<RequireAnonymous />}>
          <Route path={routes.login} element={<LoginPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to={routes.dashboard} replace />} />
            <Route path={routes.forbidden} element={<ForbiddenPage />} />

            <Route element={<RequirePermission anyOf={['dashboard:read']} />}>
              <Route path={routes.dashboard} element={<DashboardPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['fleet:read']} />}>
              <Route path={routes.fleet} element={<FleetPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['vehicle:read']} />}>
              <Route path={routes.vehicles} element={<VehiclesPage />} />
              <Route path={routes.vehicleDetail()} element={<VehicleDetailPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['driver:read']} />}>
              <Route path={routes.drivers} element={<DriversPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['incident:read']} />}>
              <Route path={routes.incidents} element={<IncidentsPage />} />
              <Route path={routes.incidentDetail()} element={<IncidentDetailPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['evidence:read']} />}>
              <Route path={routes.evidence} element={<EvidencePage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['threat:read']} />}>
              <Route path={routes.threatIntelligence} element={<ThreatIntelligencePage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['analytics:read']} />}>
              <Route path={routes.analytics} element={<AnalyticsPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['settings:read']} />}>
              <Route path={routes.settings} element={<SettingsPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['user:read']} />}>
              <Route path={routes.users} element={<UsersPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['role:read']} />}>
              <Route path={routes.roles} element={<RolesPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={['audit:read']} />}>
              <Route path={routes.auditLogs} element={<AuditLogsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
