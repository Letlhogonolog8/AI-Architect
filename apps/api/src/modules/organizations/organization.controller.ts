import type { Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as organizationService from './organization.service';
import type { UpdateOrganizationInput } from './organization.schema';

export const getOrganizationHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await organizationService.getMyOrganization(requirePrincipal(req)));
});

export const updateOrganizationHandler = asyncHandler(async (req: Request, res: Response) => {
  const organization = await organizationService.updateMyOrganization(
    requirePrincipal(req),
    req.body as UpdateOrganizationInput,
  );
  sendSuccess(res, organization);
});
