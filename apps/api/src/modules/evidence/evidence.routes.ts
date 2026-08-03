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
  createExportBundleHandler,
  getExportBundleHandler,
  getSealHandler,
  listExportBundlesHandler,
  replayTimelineHandler,
  signerStatusHandler,
  verifyEvidenceHandler,
} from './vault.controller';
import {
  evidenceIdParamSchema,
  exportEvidenceSchema,
  listEvidenceQuerySchema,
  registerEvidenceSchema,
  sealEvidenceSchema,
} from './evidence.schema';
import {
  bundleIdParamSchema,
  createExportBundleSchema,
  incidentIdParamSchema,
  listExportBundlesQuerySchema,
} from './vault.schema';

/**
 * There is no DELETE route. Purging evidence is a retention-policy operation
 * carried out by `services/evidence` under a documented schedule, not something
 * an operator can trigger from a browser.
 *
 * ## Evidence Vault routes
 *
 * The vault endpoints extend this surface: the cryptographic seal, verification,
 * court-export bundles and timeline replay. The static paths (`/exports`,
 * `/signer`, `/incidents/:id/replay`) are declared **before** the `/:evidenceId`
 * routes so Express does not read `exports` as an evidence id.
 *
 * There is deliberately **no route that fabricates a signature**: a seal or a
 * bundle carries a real SHA-256 digest and is `UNSIGNED` until an HSM/KMS signer
 * is registered. `GET /signer` reports that state honestly.
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

// -------------------------------------------------------------- vault: static

/** Whether a real signer is installed. Honest health surface; false in this build. */
evidenceRoutes.get('/signer', requirePermissions('evidence:read'), signerStatusHandler);

/**
 * Assembles a court-export bundle from one or more sealed artefacts. On
 * `evidence:export`, the same disclosure permission a single-artefact export
 * requires.
 */
evidenceRoutes.post(
  '/exports',
  requirePermissions('evidence:export'),
  validate({ body: createExportBundleSchema }),
  createExportBundleHandler,
);

evidenceRoutes.get(
  '/exports',
  requirePermissions('evidence:read'),
  validate({ query: listExportBundlesQuerySchema }),
  listExportBundlesHandler,
);

evidenceRoutes.get(
  '/exports/:bundleId',
  requirePermissions('evidence:read'),
  validate({ params: bundleIdParamSchema }),
  getExportBundleHandler,
);

/** The forensic timeline replay for an incident. */
evidenceRoutes.get(
  '/incidents/:incidentId/replay',
  requirePermissions('evidence:read'),
  validate({ params: incidentIdParamSchema }),
  replayTimelineHandler,
);

// ------------------------------------------------------------ per-artefact

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

/** The cryptographic seal — manifest digest and signature status — for an artefact. */
evidenceRoutes.get(
  '/:evidenceId/seal',
  requirePermissions('evidence:read'),
  validate({ params: evidenceIdParamSchema }),
  getSealHandler,
);

/** Recomputes the manifest digest and replays the custody chain. */
evidenceRoutes.post(
  '/:evidenceId/verify',
  requirePermissions('evidence:read'),
  validate({ params: evidenceIdParamSchema }),
  verifyEvidenceHandler,
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
