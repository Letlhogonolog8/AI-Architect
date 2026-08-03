import { Router } from 'express';
import { livenessHandler, readinessHandler } from './health.controller';

/**
 * Unauthenticated by design: the orchestrator probing these has no credentials.
 * Neither response discloses anything an attacker can use — no connection
 * strings, no hostnames, no schema.
 */
export const healthRoutes: Router = Router();

healthRoutes.get('/live', livenessHandler);
healthRoutes.get('/ready', readinessHandler);
