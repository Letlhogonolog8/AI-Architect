import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  custodyChainHandler,
  exportEvidenceHandler,
  getEvidenceHandler,
  listEvidenceHandler,
  registerEvidenceHandler,
  sealEvidenceHandler,
} from './evidence.controller';
import {
  evidenceIdParamSchema,
  exportEvidenceSchema,
  listEvidenceQuerySchema,
  registerEvidenceSchema,
  sealEvidenceSchema,
} from './evidence.schema';

/**
 * There is no DELETE route. Purging evidence is a retention-policy operation
 * carried out by `services/evidence` under a documented schedule, not something
 * an operator can trigger from a browser.
 */
export const evidenceRoutes: Router = Router();

evidenceRoutes.use(authenticate);

evidenceRoutes.get(
  '/',
  requirePermissions('evidence:read'),
  validate({ query: listEvidenceQuerySchema }),
  listEvidenceHandler,
);

evidenceRoutes.post(
  '/',
  requirePermissions('evidence:upload'),
  validate({ body: registerEvidenceSchema }),
  registerEvidenceHandler,
);

evidenceRoutes.get(
  '/:evidenceId',
  requirePermissions('evidence:read'),
  validate({ params: evidenceIdParamSchema }),
  getEvidenceHandler,
);

evidenceRoutes.post(
  '/:evidenceId/seal',
  requirePermissions('evidence:upload'),
  validate({ params: evidenceIdParamSchema, body: sealEvidenceSchema }),
  sealEvidenceHandler,
);

evidenceRoutes.post(
  '/:evidenceId/export',
  requirePermissions('evidence:export'),
  validate({ params: evidenceIdParamSchema, body: exportEvidenceSchema }),
  exportEvidenceHandler,
);

evidenceRoutes.get(
  '/:evidenceId/custody',
  requirePermissions('evidence:read'),
  validate({ params: evidenceIdParamSchema }),
  custodyChainHandler,
);
