import type { Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../../core/http';
import { checkHealth } from './health.service';

/** Liveness. Answers "is this process running", nothing more. */
export const livenessHandler = (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'alive' });
};

/**
 * Readiness. Answers "should the load balancer send this replica traffic".
 * Returns 503 when degraded so an unhealthy replica is pulled from rotation.
 */
export const readinessHandler = asyncHandler(async (_req: Request, res: Response) => {
  const report = await checkHealth();
  sendSuccess(res, report, report.status === 'healthy' ? 200 : 503);
});
