import { Router } from 'express';
import { API_VERSION, APP_NAME } from '@aegisdrive/shared';
import { alertRoutes } from '../modules/alerts/alert.routes';
import { auditLogRoutes } from '../modules/audit-logs/audit.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { behaviourRoutes } from '../modules/behaviour/behaviour.routes';
import { cabinRoutes } from '../modules/cabin/cabin.routes';
import { analyticsRoutes, dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { corridorRoutes } from '../modules/corridor/corridor.routes';
import { decisionRoutes } from '../modules/decisions/decision.routes';
import { driverRoutes } from '../modules/drivers/driver.routes';
import { evidenceRoutes } from '../modules/evidence/evidence.routes';
import { identityRoutes } from '../modules/identity/identity.routes';
import { incidentRoutes } from '../modules/incidents/incident.routes';
import { notificationRoutes } from '../modules/notifications/notification.routes';
import { organizationRoutes } from '../modules/organizations/organization.routes';
import { recoveryRoutes } from '../modules/recovery/recovery.routes';
import { roleRoutes } from '../modules/roles/role.routes';
import { sosRoutes } from '../modules/sos/sos.routes';
import { telemetryRoutes } from '../modules/telemetry/telemetry.routes';
import { threatRoutes } from '../modules/threat-events/threat.routes';
import { userRoutes } from '../modules/users/user.routes';
import { vehicleRoutes } from '../modules/vehicles/vehicle.routes';

/**
 * The versioned API surface.
 *
 * Every module mounts exactly once, here. Each router applies its own
 * `authenticate` and permission guards rather than inheriting them from this
 * level — a route's authorisation should be readable in the file that defines
 * it, not inferred from where it happens to be mounted.
 */
export const apiRouter: Router = Router();

apiRouter.get('/', (_req, res) => {
  res.json({ name: APP_NAME, api: API_VERSION, documentation: '/docs/api' });
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/organization', organizationRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/roles', roleRoutes);
apiRouter.use('/vehicles', vehicleRoutes);
apiRouter.use('/drivers', driverRoutes);
apiRouter.use('/incidents', incidentRoutes);
apiRouter.use('/evidence', evidenceRoutes);
apiRouter.use('/alerts', alertRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/telemetry', telemetryRoutes);
apiRouter.use('/threat-events', threatRoutes);
apiRouter.use('/identity', identityRoutes);
apiRouter.use('/behaviour', behaviourRoutes);
apiRouter.use('/cabin', cabinRoutes);
apiRouter.use('/decisions', decisionRoutes);
apiRouter.use('/corridor', corridorRoutes);
apiRouter.use('/sos', sosRoutes);
apiRouter.use('/recovery', recoveryRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/audit-logs', auditLogRoutes);
