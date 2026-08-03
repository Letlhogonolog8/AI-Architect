import type { Request, Response } from 'express';
import type { RoleName } from '@aegisdrive/types';
import { asyncHandler, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as roleService from './role.service';

export const listRolesHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await roleService.listRoles(requirePrincipal(req)));
});

export const getRoleHandler = asyncHandler(async (req: Request, res: Response) => {
  const role = await roleService.getRole(requirePrincipal(req), req.params.name as RoleName);
  sendSuccess(res, role);
});
