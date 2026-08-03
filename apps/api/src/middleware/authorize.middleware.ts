import type { RequestHandler } from 'express';
import type { Permission, RoleName } from '@aegisdrive/types';
import { AuditAction } from '@aegisdrive/types';
import {
  ErrorCode,
  ForbiddenError,
  UnauthorizedError,
  hasAllPermissions,
  hasAnyPermission,
  hasRole,
} from '@aegisdrive/shared';
import { recordAudit } from '../modules/audit-logs/audit.service';
import { clientIp } from '../core/http';

/**
 * Permission gate.
 *
 * A denial is an audit event, not just a 403: repeated denials against evidence
 * or immobilisation endpoints are exactly the signal a SOC needs. `authenticate`
 * must run before this.
 */
function guard(
  check: (permissions: Permission[]) => boolean,
  required: Permission[],
): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;

    if (!user) {
      next(new UnauthorizedError('Authentication is required for this endpoint.'));
      return;
    }

    if (check(user.permissions)) {
      next();
      return;
    }

    void recordAudit({
      organizationId: user.organizationId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: AuditAction.PERMISSION_DENIED,
      resourceType: 'endpoint',
      resourceId: `${req.method} ${req.originalUrl}`,
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent'),
      metadata: { required, held: user.permissions },
    });

    next(
      new ForbiddenError(
        'You do not hold the permission required for this action.',
        ErrorCode.INSUFFICIENT_PERMISSIONS,
      ),
    );
  };
}

/** Requires every listed permission. */
export function requirePermissions(...required: Permission[]): RequestHandler {
  return guard((held) => hasAllPermissions({ permissions: held }, required), required);
}

/** Requires at least one of the listed permissions. */
export function requireAnyPermission(...required: Permission[]): RequestHandler {
  return guard((held) => hasAnyPermission({ permissions: held }, required), required);
}

/**
 * Role gate. Prefer `requirePermissions` — roles are a grouping of permissions
 * and gating on them directly makes the policy harder to change. This exists
 * for the handful of endpoints that are genuinely role-shaped, such as the
 * law-enforcement export flow.
 */
export function requireRoles(...roles: RoleName[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;

    if (!user) {
      next(new UnauthorizedError('Authentication is required for this endpoint.'));
      return;
    }

    if (hasRole(user, roles)) {
      next();
      return;
    }

    next(new ForbiddenError('This action is restricted to other roles.', ErrorCode.FORBIDDEN));
  };
}
